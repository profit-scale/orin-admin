import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function CompanyDetail() {
  const { id } = useParams()

  return (
    <div>
      <Link
        to="/companies"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to companies
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100 mb-1">Company detail</h1>
        <p className="text-sm text-slate-500 font-mono">{id}</p>
      </div>

      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 backdrop-blur p-6">
        <p className="text-sm text-slate-400">
          Detailed view coming soon. This page will surface members, billing,
          subscription status, GHL connection, feature flags, and an audit log
          for the selected organization.
        </p>
      </div>
    </div>
  )
}
