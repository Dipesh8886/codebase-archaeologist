import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { addRepoSchema, estimateRepoSchema } from '../utils/schemas.js';
import {
  listGithubRepos,
  estimateRepo,
  addRepo,
  listRepos,
  getRepo,
  deleteRepo,
} from '../controllers/repo.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/github', asyncHandler(listGithubRepos));
router.post('/estimate', validate(estimateRepoSchema), asyncHandler(estimateRepo));
router.post('/', validate(addRepoSchema), asyncHandler(addRepo));
router.get('/', asyncHandler(listRepos));
router.get('/:repoId', asyncHandler(getRepo));
router.delete('/:repoId', asyncHandler(deleteRepo));

export default router;
