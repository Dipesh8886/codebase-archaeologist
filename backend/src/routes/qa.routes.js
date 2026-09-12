import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { questionRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { askQuestionSchema } from '../utils/schemas.js';
import { ask, listHistory, deleteHistory, exportHistory } from '../controllers/qa.controller.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);

router.post('/', questionRateLimiter, validate(askQuestionSchema), asyncHandler(ask));
router.get('/', asyncHandler(listHistory));
router.delete('/', asyncHandler(deleteHistory));
router.get('/export', asyncHandler(exportHistory));

export default router;
