# Use official Python runtime
FROM python:3.10

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefer-binary -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port Cloud Run expects
ENV PORT=8080
EXPOSE 8080

# Make start script executable
RUN chmod +x start.sh

CMD ["./start.sh"]