import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getClusteredGraph, getExpandedCluster } from '../controllers/graph.controller.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', asyncHandler(getClusteredGraph));
router.get('/expand/:dir', asyncHandler(getExpandedCluster));

export default router;
