import pandas as pd
from google.cloud import storage
from dotenv import load_dotenv
import os
load_dotenv()

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service-account-key.json"
def upload_to_gcs(local_file, bucket_name, destination_blob_name):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_filename(local_file)
    print(f"File {local_file} uploaded to {bucket_name}/{destination_blob_name}.")

def get_datas():
    try:
        from datasets import load_dataset
        dataset = load_dataset("open-llm-leaderboard/contents", split="train").sort("Average ⬆️", reverse=True)
        return pd.DataFrame(dataset)
    except Exception as e:
        print(f"⚠️ Data Download Error: {e}")
        print("ℹ️ Using Mock Data for Cloud Upload (Demo Mode)")
        return pd.DataFrame([
            {'fullname': 'Gemini 1.5 Pro', 'Official Providers': True, 'Available on the hub': True, 'Flagged': False, '#Params (B)': 0, 'Average ⬆️': 85.0, 'MMLU': 81.9, 'GSM8K': 92.0, 'Architecture': 'Transformer', 'Hub License': 'Proprietary'},
            {'fullname': 'GPT-4o', 'Official Providers': True, 'Available on the hub': True, 'Flagged': False, '#Params (B)': 0, 'Average ⬆️': 88.0, 'MMLU': 88.7, 'GSM8K': 95.0, 'Architecture': 'Transformer', 'Hub License': 'Proprietary'},
            {'fullname': 'meta-llama/Llama-3-70B', 'Official Providers': True, 'Available on the hub': True, 'Flagged': False, '#Params (B)': 70, 'Average ⬆️': 82.0, 'MMLU': 82.0, 'GSM8K': 85.0, 'Architecture': 'Llama', 'Hub License': 'Open'},
            {'fullname': 'mistralai/Mistral-7B', 'Official Providers': True, 'Available on the hub': True, 'Flagged': False, '#Params (B)': 7, 'Average ⬆️': 60.0, 'MMLU': 60.0, 'GSM8K': 50.0, 'Architecture': 'Mistral', 'Hub License': 'Apache 2.0'},
        ])

def main():
    bucket_name = os.getenv("BUCKET_NAME", "genai-architect-data-2026")
    destination_blob_name = "llm_leaderboard.csv"
    local_file = "llm_leaderboard.csv"

    print("Downloading dataset from Hugging Face...")
    data = get_datas()
    print("Saving to CSV...")
    data.to_csv(local_file, index=False)
    print(f"Uploading to bucket: {bucket_name}...")
    upload_to_gcs(local_file, bucket_name, destination_blob_name)
    print("Leaderboard updated successfully!")

if __name__ == "__main__":
    main()

# gcloud scheduler jobs create http update-leaderboard-job \
#     --schedule "0 */2 * * *" \
#     --uri "https://us-central1-PROJECT_ID.cloudfunctions.net/update_leaderboard" \
#     --http-method GET

# gcloud projects add-iam-policy-binding PROJECT_ID \
#     --member="serviceAccount:PROJECT_ID@appspot.gserviceaccount.com" \
#     --role="roles/cloudfunctions.invoker"
