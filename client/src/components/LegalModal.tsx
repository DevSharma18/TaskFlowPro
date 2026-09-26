import React, { useState } from 'react';
import { X, ShieldCheck, FileText, Lock } from 'lucide-react';

export type LegalTab = 'privacy' | 'terms';

interface LegalModalProps {
  initialTab?: LegalTab;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ initialTab = 'privacy', onClose }) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
      <div className="glass-panel w-full max-w-3xl max-h-[85vh] flex flex-col border border-slate-200/90 dark:border-surface-border text-slate-900 dark:text-slate-100 rounded-sm shadow-2xl relative my-6 animate-modal-enter">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200/80 dark:border-surface-border shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary flex items-center justify-center rounded-sm">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeTab === 'privacy' ? 'Privacy Policy' : 'Terms and Conditions'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                TaskFlow Pro legal compliance, data boundaries, and service governance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200/80 dark:border-surface-border bg-slate-50/80 dark:bg-slate-900/40 px-4 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'privacy'
                ? 'border-brand-primary text-brand-primary font-semibold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Privacy Policy</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'terms'
                ? 'border-brand-primary text-brand-primary font-semibold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms of Service</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
          {activeTab === 'privacy' ? (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mb-1">
                  Effective Date: September 2026
                </p>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  1. Scope and Commitment
                </h3>
                <p>
                  TaskFlow Pro provides workflow orchestration, timeline scheduling, and collaboration infrastructure
                  for software engineering teams. We treat customer task data, dependency topologies, and account
                  credentials with strict security controls. We do not sell user data, train foundational models on
                  private workspace content, or disclose internal organization structures to third parties.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  2. Information We Collect
                </h3>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
                  <li>
                    <strong className="text-slate-800 dark:text-slate-200">Account Credentials:</strong> Full name, verified
                    email address, role, and salted bcrypt password hashes.
                  </li>
                  <li>
                    <strong className="text-slate-800 dark:text-slate-200">Workspace Records:</strong> Task titles,
                    descriptions, priority levels, estimated story points, start and end dates, and dependency links.
                  </li>
                  <li>
                    <strong className="text-slate-800 dark:text-slate-200">Session and Telemetry Data:</strong> IP address,
                    user agent, session identifiers, and token rotation timestamps stored securely in an isolated session store.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  3. Use of Information and AI Processing
                </h3>
                <p>
                  Your information is utilized solely to maintain real-time task boards, compute dependency topological
                  orderings, and prevent schedule regressions. When optional AI features are invoked (such as prerequisite
                  suggestions or schedule risk checks), only necessary task IDs and sanitized task titles within your
                  explicit team workspace are provided to the model inference API. All model responses are validated by
                  code invariants prior to presentation and require explicit user acceptance.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  4. Data Isolation and Multi-Tenancy
                </h3>
                <p>
                  Every database record is strictly partitioned by team workspace identifier. Cross-tenant access is
                  blocked at the API router layer, database query level, and cache store namespace. Active sessions
                  automatically expire via database time-to-live indexes.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  5. Security Standards
                </h3>
                <p>
                  We implement HTTPS transport encryption, HTTP-only SameSite cookies, JWT signature verification using
                  explicit HMAC SHA-256 algorithm enforcement, per-user rate limiting, and automated supply-chain integrity
                  checks.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  6. User Rights and Erasure
                </h3>
                <p>
                  Team administrators possess the right to export, modify, or permanently delete workspace task data and
                  team member associations at any time. Inquiries regarding data retention may be directed to privacy@taskflow.dev.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mb-1">
                  Effective Date: September 2026
                </p>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  1. Agreement to Terms
                </h3>
                <p>
                  By accessing or utilizing TaskFlow Pro, you agree to be bound by these Terms of Service. If you are
                  using the platform on behalf of an enterprise or organization, you represent that you possess the authority
                  to bind that organization to these provisions.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  2. Acceptable Use Policy
                </h3>
                <p>You agree not to:</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400 mt-1">
                  <li>Attempt to bypass tenant isolation controls, authentication gates, or rate-limiting thresholds.</li>
                  <li>Transmit malicious scripts, automated exploits, or adversarial injection payloads.</li>
                  <li>Interfere with real-time WebSocket communication infrastructure or disrupt platform availability.</li>
                  <li>Reverse engineer underlying graph processing engines or database persistence adapters.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  3. Ownership and Intellectual Property
                </h3>
                <p>
                  You retain all ownership rights and intellectual property interests in the tasks, project descriptions,
                  and documentation authored by your organization within TaskFlow Pro. TaskFlow Pro retains ownership of the
                  platform software, scheduling algorithms, and visual interfaces.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  4. Dependency Invariants and Scheduling Calculations
                </h3>
                <p>
                  The platform provides automated topological schedule shifting and cycle detection based on inputs supplied
                  by team members. While algorithmic invariants are enforced deterministically, teams remain responsible for
                  validating external delivery timelines and project deadlines.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  5. Service Availability and Termination
                </h3>
                <p>
                  We strive for high platform availability. Access may be suspended or terminated for violations of the
                  Acceptable Use Policy or security tampering attempts. You may terminate your account at any time by
                  requesting workspace deletion.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  6. Limitation of Liability
                </h3>
                <p>
                  To the maximum extent permitted by applicable law, TaskFlow Pro shall not be liable for indirect,
                  consequential, or punitive damages arising from platform usage, service downtime, or algorithmic scheduling
                  adjustments.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-3.5 border-t border-slate-200/80 dark:border-surface-border bg-slate-50/50 dark:bg-slate-900/30 rounded-b-sm shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            TaskFlow Pro Platform Governance
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-surface-100 dark:hover:bg-surface-200 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
