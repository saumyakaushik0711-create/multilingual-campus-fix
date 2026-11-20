# Multilingual Campus Fix

Build a clean, modern React + Tailwind CSS web app called "CampusFix AI — Hinglish Complaint Router" for a college hackathon.

​Core Functionality:

 ​API Configuration: Include a settings button/modal in the top navbar where the user can enter their Google Gemini API Key (saved in localStorage, with fallback to VITE_GEMINI_API_KEY env variable). Use the gemini-2.5-flash model via standard fetch API to the Gemini REST endpoint.

 ​Single Complaint Submission: A text area where students can enter messy complaints in English, Hinglish, or Romanised Punjabi (e.g., "bhai 4th floor ka washroom ka tap 3 din se leak kar rha h" or "veere BH-2 de room 304 ch pankha nahi chal reha"). Include 3–4 clickable sample buttons so judges can test quickly.

 ​AI Classification & Extraction (JSON Output): When submitted, send a strict system prompt to Gemini asking it to return ONLY valid JSON with:

 ​department: Must be strictly one of: Plumbing, Electrical, Wi-Fi, Mess, Academic, Other.

 ​location: Object with block, floor, room (use "Not specified" if not mentioned; never guess).

 ​urgency: High, Medium, or Low.

 ​confidence: Integer from 0 to 100.

​reason: A short 1-line explanation of why it chose this department.

 ​Routing & Human Review Queue:

 ​If confidence < 75, automatically route the ticket to a "Human Review Queue" tab instead of a department tab, with a button for staff to manually approve/reassign it.

​If confidence >= 75, route it to the respective department's ticket queue.

 ​Live Metrics (Cost & Latency):

 ​Measure exact latency in milliseconds (performance.now() before and after the API call).

 ​Calculate per-complaint cost in USD and INR (using usageMetadata.promptTokenCount and candidatesTokenCount from the Gemini response, assuming $0.10/1M input tokens and $0.40/1M output tokens, 1 USD = ₹85).

​Display latency and cost on every ticket card, plus show Average Latency, Total Cost, and Total Tickets in top summary cards.

 ​Bulk Test Mode (For Judges):

 ​Add a "Bulk Test" tab where judges can paste multiple complaints (one per line) or upload a .csv file.

​Process all complaints, show a progress bar, and display a clean results table with Department, Location, Urgency, Confidence, Latency, and Cost, plus an "Export CSV" button.

​UI/UX:

 ​Clean, responsive dashboard with tabs: All Tickets, Human Review Queue, Plumbing, Electrical, Wi-Fi, Mess, Academic, Other, and Bulk Test.

​Color-coded badges for Urgency (Red/Yellow/Green) and Confidence score.

​Save tickets in localStorage so refreshing the page doesn't lose data, with a "Clear All" button.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://multilingual-campus-fix.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9c0e0f0a-b9c1-5a0e-a487-4226e265ec1d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
