import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { loginWithGithub } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full text-center space-y-6"
      >
        <div className="space-y-2">
          <img src="/logo.svg" alt="" className="h-14 w-14 mx-auto mb-2 rounded-2xl" />
          <h1 className="text-3xl font-semibold tracking-tight">Codebase Archaeologist</h1>
          <p className="text-gray-400">
            Ask questions about any GitHub repo and get answers with exact file citations.
          </p>
        </div>

        <button
          onClick={loginWithGithub}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-white text-gray-900 font-medium py-3 hover:bg-gray-200 transition-colors"
        >
          <GithubIcon />
          Continue with GitHub
        </button>

        <p className="text-xs text-gray-500">
          Read-only access to your repos. We never store your email, name, or passwords —
          only your GitHub ID.
        </p>
      </motion.div>
    </div>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.71 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.44-2.7 5.42-5.27 5.7.42.36.78 1.07.78 2.15 0 1.56-.02 2.81-.02 3.19 0 .3.21.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}
