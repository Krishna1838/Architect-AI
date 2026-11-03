let currentMarkdown = "";
let currentConstructedPrompt = "";
let currentTask = "";
let savedProjectsCache = [];

// Configure Marked.js with Highlight.js for syntax highlighting
if (typeof marked !== 'undefined') {
    marked.setOptions({
        highlight: function(code, lang) {
            const language = (typeof hljs !== 'undefined' && hljs.getLanguage(lang)) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-'
    });
}

function switchTab(tabName) {
    // Hide all sections
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    
    // Show target section
    const target = document.getElementById(tabName);
    if (target) target.classList.add('active');
    
    // Activate button (Scoped to nav to avoid affecting other buttons)
    const nav = document.querySelector('nav');
    if (nav) {
        nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const btn = nav.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (btn) btn.classList.add('active');
    }

    if (tabName === 'saved') {
        renderSavedProjects();
    }
}

async function findModels() {
    const task = document.getElementById('finder-task').value;
    const size = document.getElementById('finder-size').value;
    const topK = document.getElementById('finder-topk').value;
    const resultsDiv = document.getElementById('finder-results');
    const loadingDiv = document.getElementById('finder-loading');

    if (!task) return alert("Please enter a task!");

    resultsDiv.innerHTML = '';
    loadingDiv.classList.remove('hidden');

    try {
        const response = await fetch('/api/find_model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: task, max_params: size, top_k: topK })
        });

        if (!response.ok) {
            throw new Error(`Server Error: ${response.statusText}`);
        }

        const data = await response.json();
        loadingDiv.classList.add('hidden');

        if (data.error) {
            resultsDiv.innerHTML = `<div class="error">Error: ${data.error}</div>`;
            return;
        }

        if (data.models.length === 0) {
            resultsDiv.innerHTML = '<div>No models found.</div>';
            return;
        }

        resultsDiv.innerHTML = `<h3>Recommended Benchmarks: ${data.benchmarks.join(', ')}</h3>`;

        data.models.forEach(model => {
            const card = document.createElement('div');
            card.className = 'model-card';
            card.innerHTML = `
                <div class="model-header">
                    <h3>${model['Model Name']}</h3>
                    <span class="metric-badge">Score: ${parseFloat(model['Score']).toFixed(1)}</span>
                </div>
                <div class="metrics">
                    <span class="metric-badge"><i class="fas fa-weight-hanging"></i> ${model['#Params (B)']}B Params</span>
                    <span class="metric-badge"><i class="fas fa-microchip"></i> ${model['Architecture']}</span>
                </div>
                <p><strong>Purpose:</strong> ${model.purpose || 'N/A'}</p>
                <p><strong>Characteristics:</strong> ${model.characteristics || 'N/A'}</p>
                <p><a href="${model.url || ('https://huggingface.co/' + encodeURIComponent(model['Model Name']))}" target="_blank" rel="noopener noreferrer">🔗 View Model on Hugging Face</a></p>
                <div class="code-wrapper">
                    <button class="copy-btn" onclick="copyToClipboard(this)"><i class="fas fa-copy"></i> Copy</button>
                    <div class="code-block">${model.usage || '# No code available'}</div>
                </div>
            `;
            resultsDiv.appendChild(card);
        });

    } catch (e) {
        loadingDiv.classList.add('hidden');
        resultsDiv.innerHTML = `<div class="error">Network Error: ${e.message}</div>`;
    }
}

async function generateBlueprint() {
    const task = document.getElementById('architect-task').value;
    const size = document.getElementById('architect-size').value;
    const statusDiv = document.getElementById('architect-status');
    const resultDiv = document.getElementById('architect-results');
    const regenBtn = document.getElementById('regenerate-btn');

    if (!task) return alert("Please describe your project!");
    
    // Safety Checks
    if (!statusDiv || !resultDiv) {
        console.error("Critical Error: UI elements not found. Check IDs in HTML.");
        alert("UI Error: Please refresh the page.");
        return;
    }

    const promptCard = document.getElementById('constructed-prompt-card');
    if (promptCard) promptCard.classList.add('hidden');
    statusDiv.classList.remove('hidden');
    statusDiv.innerHTML = 'Initializing...';
    if (regenBtn) regenBtn.classList.add('hidden');
    resultDiv.classList.add('hidden');
    resultDiv.innerHTML = '';

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: task, max_params: size })
        });

        if (!response.ok) {
            throw new Error(`Server Error: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop(); 

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const jsonStr = line.substring(6);
                        const data = JSON.parse(jsonStr);

                        if (data.type === 'log') {
                            statusDiv.innerHTML += `<div>👉 ${data.content}</div>`;
                            statusDiv.scrollTop = statusDiv.scrollHeight;
                        } else if (data.type === 'result') {
                            statusDiv.innerHTML += `<div>✅ Done! Rendering...</div>`;
                            resultDiv.classList.remove('hidden');
                            const actionsDiv = document.getElementById('architect-actions');
                            if (actionsDiv) actionsDiv.classList.remove('hidden');
                            
                            currentMarkdown = data.data.markdown_report;
                            currentConstructedPrompt = data.data.constructed_prompt || '';
                            currentTask = data.data.user_input || task;

                            // Display constructed prompt card
                            if (promptCard && currentConstructedPrompt) {
                                promptCard.classList.remove('hidden');
                                const rawInputSpan = document.getElementById('user-raw-input');
                                const promptTextPre = document.getElementById('constructed-prompt-text');
                                if (rawInputSpan) rawInputSpan.innerText = currentTask;
                                if (promptTextPre) promptTextPre.innerText = currentConstructedPrompt;
                            }

                            if (typeof marked !== 'undefined') {
                                resultDiv.innerHTML = marked.parse(data.data.markdown_report);
                            } else {
                                resultDiv.innerText = data.data.markdown_report;
                                console.warn("Marked.js not loaded, displaying raw text.");
                            }
                            
                            if (regenBtn) regenBtn.classList.remove('hidden');
                        } else if (data.type === 'error') {
                            statusDiv.innerHTML += `<div style="color:red">❌ Error: ${data.content}</div>`;
                        }
                    } catch (e) {
                        console.error("Parse error", e);
                    }
                }
            }
        }

    } catch (e) {
        statusDiv.innerHTML += `<div style="color:red">❌ Network Error: ${e.message}</div>`;
    }
}

function copyToClipboard(btn) {
    const code = btn.nextElementSibling.innerText;
    navigator.clipboard.writeText(code).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => btn.innerHTML = original, 2000);
    });
}

function saveBlueprint() {
    if (!currentMarkdown) return alert("No blueprint to save!");
    const task = document.getElementById('architect-task').value || currentTask || "Untitled Project";
    
    const projectData = {
        task: task,
        markdown_report: currentMarkdown,
        constructed_prompt: currentConstructedPrompt
    };
    
    fetch('/api/save_project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_data: projectData })
    })
    .then(res => res.json())
    .then(data => {
        if(data.error) alert("Error: " + data.error);
        else {
            const btn = document.querySelector('button[onclick="saveBlueprint()"]');
            if (btn) {
                const original = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
                setTimeout(() => btn.innerHTML = original, 2000);
            }
        }
    })
    .catch(err => alert("Network Error: " + err));
}

async function renderSavedProjects() {
    const list = document.getElementById('saved-list');
    if (!list) return;
    
    list.innerHTML = '<p style="text-align:center;">Loading...</p>';

    try {
        const res = await fetch('/api/history');
        const saved = await res.json();
        savedProjectsCache = saved;
    
        if (saved.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:20px; color: #666;">No saved projects found.</p>';
            return;
        }
        
        list.innerHTML = saved.map(p => `
            <div class="model-card">
                <div class="model-header">
                    <h3>${p.task && p.task.length > 60 ? p.task.substring(0, 60) + '...' : (p.task || 'Untitled')}</h3>
                    <span class="metric-badge">${p.timestamp ? new Date(p.timestamp).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div class="saved-actions" style="margin-top:15px;">
                    <button class="action-btn" style="width:auto; display:inline-block; padding: 8px 15px;" onclick="loadProject('${p.id}')"><i class="fas fa-eye"></i> View</button>
                    <button class="action-btn" style="width:auto; display:inline-block; padding: 8px 15px; background-color: #ff7675;" onclick="deleteProject('${p.id}')"><i class="fas fa-trash"></i> Delete</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = `<p style="color:red; text-align:center;">Error loading history: ${e.message}</p>`;
    }
}

function loadProject(id) {
    const project = savedProjectsCache.find(p => p.id === id);
    if (project) {
        currentMarkdown = project.markdown_report;
        currentConstructedPrompt = project.constructed_prompt || '';
        currentTask = project.task;
        document.getElementById('architect-task').value = project.task;

        // Render constructed prompt if available
        const promptCard = document.getElementById('constructed-prompt-card');
        if (promptCard) {
            if (currentConstructedPrompt) {
                promptCard.classList.remove('hidden');
                const rawInputSpan = document.getElementById('user-raw-input');
                const promptTextPre = document.getElementById('constructed-prompt-text');
                if (rawInputSpan) rawInputSpan.innerText = currentTask;
                if (promptTextPre) promptTextPre.innerText = currentConstructedPrompt;
            } else {
                promptCard.classList.add('hidden');
            }
        }

        const resultDiv = document.getElementById('architect-results');
        if (typeof marked !== 'undefined') {
            resultDiv.innerHTML = marked.parse(project.markdown_report);
        } else {
            resultDiv.innerText = project.markdown_report;
        }
        resultDiv.classList.remove('hidden');
        document.getElementById('architect-actions').classList.remove('hidden');
        switchTab('architect');
    }
}

async function deleteProject(id) {
    if(!confirm("Delete this project?")) return;
    try {
        const res = await fetch(`/api/project/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if(data.error) alert(data.error);
        else renderSavedProjects();
    } catch(e) {
        alert("Error: " + e.message);
    }
}

function downloadBlueprint() {
    if (!currentMarkdown) return alert("No blueprint to download!");
    let fullReport = currentMarkdown;
    if (currentConstructedPrompt) {
        fullReport = `> **📋 User's Basic Input:**\n> "${currentTask || 'N/A'}"\n>\n> **🔍 LLM Constructed Prompt (System Augmentation):**\n<details>\n<summary>Click to view the full prompt constructed by the system</summary>\n\n\`\`\`text\n${currentConstructedPrompt}\n\`\`\`\n</details>\n\n---\n\n${currentMarkdown}`;
    }
    const blob = new Blob([fullReport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project_blueprint.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function toggleConstructedPrompt() {
    const body = document.getElementById('constructed-prompt-body');
    const icon = document.getElementById('prompt-toggle-icon');
    if (body) {
        if (body.style.display === 'none') {
            body.style.display = 'block';
            if (icon) icon.className = 'fas fa-chevron-up';
        } else {
            body.style.display = 'none';
            if (icon) icon.className = 'fas fa-chevron-down';
        }
    }
}

function copyConstructedPrompt() {
    if (!currentConstructedPrompt) return;
    navigator.clipboard.writeText(currentConstructedPrompt).then(() => {
        const btn = document.getElementById('copy-prompt-btn');
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => btn.innerHTML = original, 2000);
        }
    });
}