import streamlit as st
import pandas as pd
import os
import time
from datetime import datetime, timedelta
import google.generativeai as genai
from google.cloud import storage
from streamlit_feedback import streamlit_feedback
import io
from google.cloud import bigquery
from google.oauth2 import service_account
import google.auth
from dotenv import load_dotenv
import ast
import requests
import json
try:
    from deep_translator import GoogleTranslator
    from langdetect import detect
    TRANSLATION_AVAILABLE = True
except ImportError as e:
    TRANSLATION_AVAILABLE = False
    print(f"⚠️ Translation libraries not found: {e}. Translation features disabled.")

# Load environment variables
load_dotenv()
json_key_path = 'service-account-key.json'  # Update with your service account key path

# Define scopes
SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/generative-language",
    "https://www.googleapis.com/auth/generative-language.retriever"
]

client = None
try:
    if os.path.exists(json_key_path):
        credentials = service_account.Credentials.from_service_account_file(json_key_path, scopes=SCOPES)
    else:
        # Fallback to Scoped ADC
        credentials, project = google.auth.default(scopes=SCOPES)
    
    # Create BigQuery client
    client = bigquery.Client(credentials=credentials, project=credentials.project_id if hasattr(credentials, 'project_id') else project)
except Exception as e:
    print(f"⚠️ Cloud Auth Error: {e}")

# Configure Gemini
if os.getenv("GEMINI_KEY"):
    genai.configure(api_key=os.getenv("GEMINI_KEY"))
elif 'credentials' in locals() and credentials:
    genai.configure(credentials=credentials)

model = genai.GenerativeModel(
    model_name="gemini-flash-latest",
    generation_config={"temperature": 0.2}
)

# Configuration
API_URL = os.getenv("API_URL", "http://127.0.0.1:5000")

# Set page config
st.set_page_config(
    page_title="ArchitectAI: From idea to architecture in seconds",
    page_icon="🔍🎯",
    layout="wide"
)

# Initialize session state
if 'feedback_key' not in st.session_state:
    st.session_state.feedback_key = 'feedback_widget'

if 'session_id' not in st.session_state:
    st.session_state.session_id = str(int(time.time()))
    st.session_state.session_start_time = datetime.now()
    st.session_state.welcome_shown = False
elif (datetime.now() - st.session_state.session_start_time) > timedelta(minutes=10):
    # Create new session after 10 minutes
    st.session_state.session_id = str(int(time.time()))
    st.session_state.session_start_time = datetime.now()
    st.session_state.welcome_shown = False

if 'copy_button_clicked' not in st.session_state:
    st.session_state.copy_button_clicked = False

if 'generated_blueprint' not in st.session_state:
    st.session_state.generated_blueprint = None

# Custom CSS
st.markdown("""
    <style>
    .main {
        padding: 2rem;
    }
    .stProgress > div > div > div > div {
        background-color: #DA70D6;
    }
    .element-container:has(div.stSuccessMessage) div[data-testid="stMarkdownContainer"] p {
        color: #953553 !important;
    }
    .element-container:has(div.stSuccessMessage) {
        background-color: rgba(149, 53, 83, 0.1) !important;
    }
    .element-container:has(div.stSuccessMessage) svg {
        fill: #953553 !important;
    }
    .model-table {
        margin-top: 1rem;
        margin-bottom: 2rem;
    }
    /* Enhanced Markdown Styling for Project Architect */
    h1 { color: #1E88E5; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    h2 { color: #0D47A1; margin-top: 30px; }
    h3 { color: #1565C0; }
    code { color: #D81B60; background-color: #f8f9fa; padding: 2px 5px; border-radius: 4px; }
    .stMarkdown table { width: 100%; border-collapse: collapse; }
    .stMarkdown th { background-color: #f1f3f4; border: 1px solid #dfe2e5; padding: 8px; }
    .stMarkdown td { border: 1px solid #dfe2e5; padding: 8px; }
    </style>
""", unsafe_allow_html=True)

@st.dialog("Welcome to ArchitectAI 🔍")
def welcome_message():
    st.balloons()
    st.write(f"""
🔍 **Find Your Perfect AI Model Match in 2 Simple Steps!**

✨ **Features:**
1. **Global Language Support**: Compatible with 100+ languages for worldwide accessibility
2. **Multi-Domain Support**: Suggests LLMs, SLMs, and specialized ML/DL models (Vision, Audio, etc.)
3. **Real-time Updates**: Benchmark data refreshes every 2 hours for up-to-date recommendations
4. **Quality Assured**: Only suggests official, non-flagged models you can trust

Just describe your task and set your size preference - we'll handle the rest! 

Ready to meet your perfect model match? Let's begin! 🚀

###### Collects feedback to improve — no personal data 🔒
###### Powered by Google Cloud 🌥️
""")

@st.dialog("Share Your ArchitectAI Experience 🕵️‍♂️")
def share_app():
    if 'copy_button_clicked' not in st.session_state:
        st.session_state.copy_button_clicked = False
        
    def copy_to_clipboard():
        st.session_state.copy_button_clicked = True
        st.write(f'<script>navigator.clipboard.writeText("{app_url}");</script>', unsafe_allow_html=True)
        
    app_url = 'https://github.com/SaiGayathriGudla-1184/Gen-ai-project-architect'
    text = f'''Looking for the perfect AI model? 🤔
Check out ArchitectAI - it matches you with the ideal LLM, SLM, or ML model for your needs!

Try this free tool and find your perfect model match now 🚀
Link to the app: {app_url}
    '''
    col1, col2, col3 = st.columns([1, 1, 1])
    
    with col1:
        url = f'https://www.linkedin.com/sharing/share-offsite/?url={app_url}'
        st.link_button('💼 LinkedIn', url)
    with col2:
        url = f'https://x.com/intent/post?original_referer=http%3A%2F%2Flocalhost%3A8502%2F&ref_src=twsrc%5Etfw%7Ctwcamp%5Ebuttonembed%7Ctwterm%5Eshare%7Ctwgr%5E&text={text}+%F0%9F%8E%88&url=%7B{app_url}%7D'
        st.link_button('𝕏 Twitter', url)
    with col3:
        placeholder = st.empty()
        if st.session_state.copy_button_clicked:
            placeholder.button("Copied!", disabled=True)
            st.toast('Link copied to clipboard! 📋')
        else:
            placeholder.button('📄 Copy Link', on_click=copy_to_clipboard)
    st.text_area("Sample Text", text, height=350)

def translate_to_english(text):
    """Detect language and translate to English if not already in English"""
    if not TRANSLATION_AVAILABLE:
        return text, 'en'
    try:
        detected_language = detect(text)
        if detected_language != 'en':
            translated_text = GoogleTranslator(source=detected_language, target='en').translate(text)
            return translated_text, detected_language
        return text, 'en'
    except Exception as e:
        st.warning(f"Translation error: {str(e)}. Proceeding with original text.")
        return text, 'en'

def upload_to_bq(df, table_name):
    """Upload data to BigQuery"""
    if client:
        destination_table = client.dataset("model_matrimony").table(f'{table_name}')
        job_config = bigquery.LoadJobConfig(write_disposition="WRITE_APPEND")
        load_job = client.load_table_from_dataframe(df, destination_table, job_config=job_config)
        load_job.result()

def _submit_feedback(user_response, emoji=None):
    session_id = st.session_state.get("session_id")
    feedback_value = 1 if user_response['score'] == '👍' else 0
    user_feedback = user_response['text']
    new_feedback = pd.DataFrame([[session_id, feedback_value, user_feedback]], columns=["session_id", "vote", "comment"])
    upload_to_bq(new_feedback, 'feedback_data')
    st.success("Your feedback has been submitted!")

# --- Project Architect View ---
def render_architect_view():
    st.markdown("## ✨ Project Architect Crew")
    st.markdown("Generate a comprehensive blueprint: **Step-by-step guide**, **Technical Requirements**, and **Where to get tools**.")
    
    col1, col2 = st.columns([2, 1])
    with col1:
        task_input = st.text_area("Describe your project idea:", height=150, placeholder="E.g., I want to build a real-time chat application using Python and WebSockets...")
    with col2:
        max_params = st.slider("Max AI Model Size (Billion Params)", 1, 70, 15)
        st.info("This limits the size of LLMs recommended in the architecture.")

    if st.button("🚀 Generate Project Blueprint", type="primary"):
        if not task_input:
            st.warning("Please describe your project first.")
            return

        status_container = st.status("🤖 AI Crew is working...", expanded=True)
        result_container = st.container()
        
        try:
            # Connect to Flask Backend
            url = f"{API_URL}/api/generate"
            payload = {"task": task_input, "max_params": max_params}
            
            with requests.post(url, json=payload, stream=True) as response:
                if response.status_code != 200:
                    status_container.error(f"Server Error: {response.status_code}")
                    return

                for line in response.iter_lines():
                    if line:
                        decoded_line = line.decode('utf-8')
                        if decoded_line.startswith('data: '):
                            json_str = decoded_line[6:]
                            try:
                                data = json.loads(json_str)
                                
                                if data["type"] == "log":
                                    status_container.write(f"👉 {data['content']}")
                                
                                elif data["type"] == "result":
                                    status_container.update(label="✅ Blueprint Generated!", state="complete", expanded=False)
                                    st.session_state.generated_blueprint = data["data"]
                                    st.rerun()
                                
                                elif data["type"] == "error":
                                    status_container.error(f"Error: {data['content']}")
                                    
                            except json.JSONDecodeError:
                                pass
        except requests.exceptions.ConnectionError:
            status_container.error("❌ Could not connect to Backend Server. Please run 'python server.py' in a separate terminal.")

    # Display Result & Save Button (Persistent View)
    if st.session_state.generated_blueprint:
        st.markdown("---")
        if "constructed_prompt" in st.session_state.generated_blueprint and st.session_state.generated_blueprint["constructed_prompt"]:
            with st.expander("✨ View LLM Constructed Prompt (Prompt Engineering & RAG Augmentation)", expanded=True):
                user_raw = st.session_state.generated_blueprint.get("user_input", "N/A")
                st.markdown(f"**User's Basic Input:** `{user_raw}`")
                st.code(st.session_state.generated_blueprint["constructed_prompt"], language="text")

        st.markdown(st.session_state.generated_blueprint["markdown_report"], unsafe_allow_html=True)
        
        col_d, col_s = st.columns([1, 1])
        with col_d:
            st.download_button(
                label="📥 Download Blueprint",
                data=st.session_state.generated_blueprint["markdown_report"],
                file_name="project_blueprint.md",
                mime="text/markdown"
            )
        with col_s:
            if st.button("💾 Save to Cloud History"):
                try:
                    save_resp = requests.post(f"{API_URL}/api/save_project", json={"project_data": st.session_state.generated_blueprint})
                    if save_resp.status_code == 200:
                        st.success("✅ Project saved to Firestore!")
                    else:
                        st.error(f"❌ Save failed: {save_resp.text}")
                except Exception as e:
                    st.error(f"❌ Connection error: {e}")

# Create header with title and share button
header_col1, header_col2 = st.columns([10, 1])
with header_col1:
    st.title("ArchitectAI 🚀")
    st.caption("From idea to architecture in seconds")
with header_col2:
    if st.button("Share App 📢", type="secondary"):
        share_app()

# Show welcome message only once per session
if not st.session_state.welcome_shown:
    welcome_message()
    st.session_state.welcome_shown = True

# Navigation
page = st.sidebar.radio("Select Tool", ["🔍 Perfect Model Finder", "✨ Project Architect"])

if page == "✨ Project Architect":
    render_architect_view()

elif page == "🔍 Perfect Model Finder":
    # Main app interface
    st.markdown("### 🔍 Find Your Perfect Model")
    # User input section
    st.markdown("#### Step 1: Describe Your Task")
    user_task = st.text_area(
        "",
        height=100,
        placeholder="E.g., Chatbot that answers medical questions...",
        label_visibility='hidden'
    )
    
    # Model size slider
    st.markdown("#### Step 2: Preferences")
    col1, col2 = st.columns(2)
    with col1:
        model_size = st.slider(
            "Max model size (Billion Params)",
            min_value=1, max_value=70, value=15,
            help="Limit for LLM/SLM size"
        )
    with col2:
        top_k = st.slider(
            "Number of Suggestions",
            min_value=1, max_value=10, value=5
        )
    
    # Process button
    if st.button("Find My Perfect Match! 🎯", type="primary"):
        if user_task:
            try:
                # Translate user task if not in English
                translated_task, detected_lang = translate_to_english(user_task)
                
                # Show translation info if task was translated
                if detected_lang != 'en':
                    st.info(f"Original language detected: {detected_lang}. Task has been translated to English for processing.")
                
                with st.spinner("🤖 AI Agent is analyzing benchmarks and finding models..."):
                    # Call Server API instead of local processing
                    api_url = f"{API_URL}/api/find_model"
                    try:
                        resp = requests.post(api_url, json={"task": translated_task, "max_params": model_size, "top_k": top_k})
                        if resp.status_code == 200:
                            data = resp.json()
                            models_list = data.get("models", [])
                            benchmarks = data.get("benchmarks", [])
                        else:
                            st.error(f"Server Error: {resp.text}")
                            models_list = []
                    except requests.exceptions.ConnectionError:
                        st.error("❌ Could not connect to Backend Server. Please run 'python server.py' in a separate terminal.")
                        models_list = []

                if models_list:
                    st.success(f"Found {len(models_list)} suitable models! 🎉")
                    st.write(f"**Relevant Benchmarks:** {', '.join(benchmarks)}")

                    for i, model_data in enumerate(models_list):
                        model_name = model_data.get('Model Name', 'Unknown')
                        with st.expander(f"#{i+1} {model_name} (Score: {model_data.get('Score', 0):.1f})", expanded=(i==0)):
                            c1, c2, c3 = st.columns(3)
                            c1.metric("Size", f"{model_data.get('#Params (B)', 0)}B")
                            c1.metric("Avg Score", f"{model_data.get('Average ⬆️', 0):.1f}")
                            c2.metric("Architecture", model_data.get('Architecture', 'N/A'))
                        
                            st.markdown(f"**📝 Characteristics:** {model_data.get('characteristics', 'N/A')}")
                            st.markdown(f"**🎯 Purpose:** {model_data.get('purpose', 'N/A')}")
                            st.markdown(f"**🔗 Source:** [{model_data.get('url', 'Link')}]({model_data.get('url', '#')})")
                            st.markdown("**💻 Usage:**")
                            st.code(model_data.get('usage', '# Code not available'), language='python')
                
            except Exception as e:
                st.error(f"An error occurred: {str(e)}")
        else:
            st.warning("Please describe your task first! 🙏")

    streamlit_feedback(
    feedback_type="thumbs",
    optional_text_label="Please provide extra information",
    on_submit=_submit_feedback,
    key=st.session_state.feedback_key,
)

# Footer
st.markdown(
    "<div style='text-align: center;'>"
    "Built with ❤️ ArchitectAI | From idea to architecture in seconds"
    "</div>",
    unsafe_allow_html=True
)
