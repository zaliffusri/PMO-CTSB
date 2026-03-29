import express from 'express';
import cors from 'cors';
import { initDb, seedDemo } from './db/schema.js';
import { projectsRouter } from './routes/projects.js';
import { clientsRouter } from './routes/clients.js';
import { peopleRouter } from './routes/people.js';
import { assignmentsRouter } from './routes/assignments.js';
import { activitiesRouter } from './routes/activities.js';
import { availabilityRouter } from './routes/availability.js';
import { projectTasksRouter } from './routes/projectTasks.js';

initDb();
seedDemo();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/projects', projectsRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/people', peopleRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/project-tasks', projectTasksRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`PMO CTSB API running at http://localhost:${PORT}`));
