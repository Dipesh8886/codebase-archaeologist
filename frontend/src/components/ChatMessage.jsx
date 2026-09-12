import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export default function ChatMessage({ qa }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-lg rounded-2xl rounded-br-sm bg-emerald-500 text-gray-900 px-4 py-2 text-sm font-medium">
          {qa.question}
        </div>
      </div>

      <div className="flex justify-start">
        <div className="max-w-2xl rounded-2xl rounded-bl-sm bg-gray-900 border border-gray-800 px-4 py-3 text-sm">
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{qa.answer}</ReactMarkdown>
          </div>

          {qa.citations?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap gap-1.5">
              {qa.citations.map((c, i) => (
                <a
                  key={i}
                  href={`#`}
                  onClick={(e) => e.preventDefault()}
                  className="text-xs font-mono px-2 py-1 rounded bg-gray-800 text-emerald-300 hover:bg-gray-700 transition-colors"
                  title="Open in GitHub"
                >
                  {c.filePath}:{c.startLine}-{c.endLine}
                </a>
              ))}
            </div>
          )}

          {qa.provider && qa.provider !== 'groq' && (
            <p className="text-xs text-gray-500 mt-2">Answered by backup model ({qa.provider})</p>
          )}
        </div>
      </div>
    </div>
  );
}
