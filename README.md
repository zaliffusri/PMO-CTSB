# PMO CTSB – Project & Resource Management

A system to manage projects, assign teams, and see workload and availability so you can decide who is free to take on new project work when using the same people across many projects.

## Features

- **Projects** – Create and manage projects (name, description, status, dates).
- **Team** – Add people (name, email, role). View each person’s projects and recent activities.
- **Assign team to projects** – From a project, assign team members with a role and allocation % (e.g. 80% on Project A, 20% on Project B).
- **Activities** – Log activities per person: **meetings**, **tasks**, or **other** (title, description, start/end). These drive workload and availability.
- **Workload & availability** – See for each person:
  - Which projects they’re on and total allocation %.
  - How many activities (and hours) they have in a date range.
  - **Availability %** = 100% minus total allocation (over 100% = overloaded).
- **Check availability** – Before assigning someone to another project, use “Check availability” to see their current projects, allocation, and activities in a period so you know if they’re available.

## Quick start

1. **Backend** (API + SQLite):

   ```bash
   cd backend
   npm install
   npm start
   ```

   API runs at `http://localhost:3001`.

2. **Frontend** (React):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   App runs at `http://localhost:5173` and proxies `/api` to the backend.

3. Open `http://localhost:5173` in your browser. Demo data (projects, people, assignments, activities) is created on first run.

## Usage flow

1. **Team** – Add your people (or use the seeded demo team).
2. **Projects** – Create projects and open a project to **assign team members** (role + allocation %).
3. **Activities** – Log meetings and other activities for each person so the system knows their real workload.
4. **Workload & Availability** – Use this page to see who has capacity and to **check** a person before assigning them to another project.

Data is stored in `backend/db/data.json`. Delete that file to reset and get fresh demo data on next backend start.
