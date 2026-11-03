#!/bin/bash

# Start Flask Backend in the background on port 5000
export BACKEND_PORT=5000
python server.py &

# Start Streamlit Frontend in the foreground
# Cloud Run injects the PORT environment variable (usually 8080)
streamlit run app.py --server.port $PORT --server.address 0.0.0.0