# Cultural Events Hong Kong (Group Project)

A Single Page Application (SPA) using the MERN stack (MongoDB, Express, Node.js) to display and manage cultural events in Hong Kong.

## Prerequisites

Before running the project, ensure you have the following installed:
1.  **Node.js** (v14 or higher)
2.  **MongoDB Community Server** (Must be installed and running locally)

## Installation Steps

1.  **Clone the repository** (or unzip the project folder):
    ```bash
    git clone <your-repo-url>
    cd cultural-events-hk
    ```

2.  **Install Dependencies**:
    This downloads all required libraries (Express, Mongoose, etc.).
    ```bash
    npm install
    ```

3.  **Verify XML Data**:
    Ensure `venues.xml` and `events.xml` are present in the root directory.

## How to Run

1.  **Start MongoDB**:
    Make sure your local MongoDB server is running.
    *   *Windows Service*: Usually runs automatically in the background.
    *   *Manual*: Open a terminal and run `mongod`.

2.  **Start the Server**:
    In the project root terminal:
    ```bash
    node server.js
    ```
    You should see: `Server running on http://localhost:3000`

3.  **Open the App**:
    Go to browser and visit: `http://localhost:3000`

## Demo Credentials

You can log in using these pre-configured accounts:

*   **Admin Access** (Can create/delete users & events):
    *   Username: `admin`
    *   Password: `admin123`
    *   *Note: Logging in as Admin triggers the XML data synchronization.*

*   **User Access** (Can view, like, and comment):
    *   Username: `user`
    *   Password: `user123`

## Troubleshooting

*   **Database Error?**
    If you see errors about "schema" or "likes", the database might have old data formats. Run the reset script included:
    ```bash
    node reset_db.js
    ```
    Then restart the server.

*   **Port in Use?**
    If port 3000 is taken, change the `PORT` variable in `server.js` or kill the process using that port.
