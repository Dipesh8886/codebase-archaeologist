import { Router } from 'express';
import authRoutes from './auth.routes.js';
import repoRoutes from './repo.routes.js';
import qaRoutes from './qa.routes.js';
import graphRoutes from './graph.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/repos', repoRoutes);
router.use('/repos/:repoId/questions', qaRoutes);
router.use('/repos/:repoId/graph', graphRoutes);

router.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default router;
