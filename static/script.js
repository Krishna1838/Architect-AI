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

function saveAsPdf() {
    const blueprintEl = document.getElementById('architect-results');
    if (!blueprintEl || !currentMarkdown) {
        return alert("No blueprint to save as PDF!");
    }

    const saveBtn = document.getElementById('save-pdf-btn');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing PDF...';
    }

    // Get the rendered HTML content
    const renderedHtml = blueprintEl.innerHTML;
    const taskTitle = (currentTask || 'ArchitectAI System Architecture Blueprint').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Parse rendered HTML to link labels with subsequent code blocks
    const parser = new DOMParser();
    const doc = parser.parseFromString(renderedHtml, 'text/html');

    // For every pre, ensure the preceding heading or label paragraph has the class 'code-label'
    doc.querySelectorAll('pre').forEach(pre => {
        let prev = pre.previousElementSibling;
        while (prev && prev.tagName === 'P' && prev.textContent.trim() === '') {
            prev = prev.previousElementSibling;
        }
        if (prev) {
            prev.classList.add('code-label');
            prev.style.pageBreakAfter = 'avoid';
            prev.style.breakAfter = 'avoid';
        }
    });

    let processedHtml = doc.body.innerHTML
        .replace(/\$\\le\s*/g, '≤ ')
        .replace(/\$\\ge\s*/g, '≥ ')
        .replace(/\\text\{([^}]+)\}/g, '$1')
        .replace(/\$([0-9.]+[%s])\$/g, '$1')
        .replace(/\$k\$/g, 'k');

    const printHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>ArchitectAI - Technical Blueprint</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 11mm 12mm 11mm 12mm;
        }

        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            font-size: 9pt;
            line-height: 1.45;
            margin: 0;
            padding: 0;
        }

        /* Prevent split headings */
        h1, h2, h3, h4, h5, h6 {
            color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-top: 10pt;
            margin-bottom: 3pt;
        }

        h1 {
            font-size: 15pt;
            color: #4338ca;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 4pt;
            margin-top: 0;
        }

        h2 {
            font-size: 12pt;
            color: #3730a3;
            border-bottom: 1px solid #f1f5f9;
            padding-bottom: 2pt;
        }

        h3 {
            font-size: 10pt;
            color: #1e1b4b;
        }

        /* Prevent code titles and file paths from being separated from their code block */
        .code-label, p:has(+ pre) {
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 2pt !important;
            font-weight: 600;
        }

        p, li {
            color: #334155;
            margin-top: 0;
            margin-bottom: 4pt;
            orphans: 3;
            widows: 3;
        }

        ul, ol {
            margin-top: 0;
            margin-bottom: 6pt;
            padding-left: 16px;
        }

        /* Clean Table Layout - never slices horizontally */
        table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin: 8pt 0 !important;
            page-break-inside: auto;
        }

        tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }

        th {
            background-color: #f8fafc !important;
            color: #0f172a !important;
            font-weight: 600 !important;
            text-align: left !important;
            border: 1px solid #cbd5e1 !important;
            padding: 5pt 7pt !important;
            font-size: 8pt !important;
        }

        td {
            border: 1px solid #cbd5e1 !important;
            padding: 5pt 7pt !important;
            font-size: 8pt !important;
            color: #334155 !important;
            vertical-align: top !important;
        }

        /* Code Blocks - natural page breaks without artificial voids */
        pre {
            background-color: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
            border-left: 3px solid #6366f1 !important;
            border-radius: 4px !important;
            padding: 6pt 8pt !important;
            margin: 3pt 0 8pt 0 !important;
            font-family: 'Consolas', 'Courier New', monospace !important;
            font-size: 7.2pt !important;
            line-height: 1.25 !important;
            white-space: pre-wrap !important;
            word-break: break-word !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
            color: #0f172a !important;
        }

        code {
            font-family: 'Consolas', 'Courier New', monospace !important;
            font-size: 7.5pt !important;
            background-color: #f1f5f9;
            padding: 1pt 3pt;
            border-radius: 3px;
            color: #be123c;
        }

        pre code {
            background-color: transparent !important;
            padding: 0 !important;
            font-size: 7.2pt !important;
            line-height: 1.25 !important;
            color: inherit !important;
        }

        blockquote {
            border-left: 3px solid #818cf8;
            margin: 5pt 0;
            padding: 3pt 8pt;
            background-color: #f8fafc;
            color: #475569;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .doc-header {
            border-bottom: 2px solid #4f46e5;
            padding-bottom: 5pt;
            margin-bottom: 8pt;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }

        .doc-title {
            font-size: 15pt;
            font-weight: 800;
            color: #4338ca;
            letter-spacing: -0.5px;
        }

        .doc-subtitle {
            font-size: 8.5pt;
            color: #64748b;
            font-weight: 500;
            margin-left: 8px;
        }

        .doc-meta {
            font-size: 7.5pt;
            color: #94a3b8;
            text-align: right;
        }

        .task-box {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-left: 3px solid #4f46e5;
            padding: 5pt 8pt;
            margin-bottom: 10pt;
            font-size: 8pt;
            color: #334155;
            border-radius: 4px;
        }

        .doc-footer {
            margin-top: 14pt;
            padding-top: 5pt;
            border-top: 1px solid #e2e8f0;
            font-size: 7pt;
            color: #94a3b8;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="doc-header">
        <div>
            <span class="doc-title">ArchitectAI</span>
            <span class="doc-subtitle">Technical System Blueprint</span>
        </div>
        <div class="doc-meta">
            Generated on ${new Date().toLocaleDateString()}
        </div>
    </div>
    
    <div class="task-box">
        <strong>Task:</strong> ${taskTitle}
    </div>

    <div class="content-body">
        ${processedHtml}
    </div>

    <div class="doc-footer">
        ArchitectAI &mdash; From Idea to Architecture in Seconds &bull; Confidential Capstone Blueprint
    </div>
</body>
</html>`;

    // Use an invisible iframe for seamless, popup-blocker-proof printing
    let printFrame = document.getElementById('print-iframe');
    if (printFrame) {
        document.body.removeChild(printFrame);
    }
    printFrame = document.createElement('iframe');
    printFrame.id = 'print-iframe';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const frameDoc = printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(printHtml);
    frameDoc.close();

    // Trigger print once iframe content loads
    setTimeout(() => {
        try {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
        } catch (e) {
            console.error("Print frame error, falling back to popup:", e);
            const w = window.open('', '_blank');
            if (w) {
                w.document.write(printHtml);
                w.document.close();
                w.focus();
                w.print();
            }
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
            }
        }
    }, 350);
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