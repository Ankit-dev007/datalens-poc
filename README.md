# datalens-poc

**Personal Data Discovery & Compliance Tool**

This is a Proof of Concept (POC) for a tool that identifies Personally Identifiable Information (PII) inside MySQL databases according to Indian DPDP regulations. It uses Regex and AI (OpenAI) for detection and maps data flows using Neo4j.

## Features

- **MySQL Scanner**: Connects to a database and scans all tables and columns.
- **PII Detection**:
    - **Regex**: Email, Indian Phone, Aadhaar, PAN, Address keywords, Name.
    - **AI (Optional)**: OpenAI-based classification for higher accuracy.
- **Neo4j Mapping**: Visualizes data flows by creating nodes for Tables, Fields, and PII types.
- **REST API**:
    - `POST /scan`: Triggers the scan.
    - `GET /results`: Returns the scan results.

## Technologies Used

- Node.js
- TypeScript
- Express
- MySQL2
- Neo4j Driver
- OpenAI API

## Setup Instructions

1.  **Clone the repository** (or navigate to the project folder).
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Environment Variables**:
    Create a `.env` file in the root directory with the following credentials:
    ```env
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=your_password
    DB_NAME=your_database
    
    NEO4J_URI=bolt://localhost:7687
    NEO4J_USER=neo4j
    NEO4J_PASSWORD=your_neo4j_password
    
    OPENAI_API_KEY=your_openai_api_key (optional)
    ```
4.  **Build the project**:
    ```bash
    npm run build
    ```

## How to Run

1.  **Start the server**:
    ```bash
    npm start
    ```
    The server will start on `http://localhost:3000`.

2.  **Trigger a Scan**:
    Use Postman or curl to send a POST request:
    ```bash
    curl -X POST http://localhost:3000/scan
    ```

3.  **View Results**:
    ```bash
    curl http://localhost:3000/results
    ```

## Example Output

```json
[
  {
    "table": "users",
    "pii": [
      {
        "field": "email",
        "type": "email",
        "source": "regex",
        "confidence": 0.9
      },
      {
        "field": "phone_number",
        "type": "phone",
        "source": "regex",
        "confidence": 0.9
      }
    ]
  }
]
```

## Troubleshooting

- **Database Connection Failed**: Ensure MySQL is running and credentials in `.env` are correct.
- **Neo4j Connection Failed**: Ensure Neo4j is running. The scanner will skip Neo4j writing if it fails.
- **AI Detection Failed**: Ensure `OPENAI_API_KEY` is set. If not, it falls back to mock/regex only.
"# datalens-poc" 
