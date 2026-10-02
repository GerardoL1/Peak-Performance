import { useQuery } from '@tanstack/react-query';
import { describeError, get } from '../api/client';
import type { Plan } from '../api/types';
import { PageHeader } from '../components/Layout';

const planStyle: Record<string, { border: string; icon: string }> = {
  Basic: { border: '#64748b', icon: '⭐' },
  Silver: { border: '#1a56c4', icon: '🥈' },
  Gold: { border: '#b45309', icon: '🥇' },
  Platinum: { border: '#6d28d9', icon: '💎' },
  Student: { border: '#15803d', icon: '🎓' },
};

const accessBadge: Record<string, string> = {
  Standard: 'badge-gray',
  Intermediate: 'badge-blue',
  Premium: 'badge-amber',
  Elite: 'badge-purple',
};

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export function PlansPage() {
  const {
    data: plans,
    error,
    isLoading,
  } = useQuery({ queryKey: ['/membership-plans'], queryFn: () => get<Plan[]>('/membership-plans') });

  return (
    <div>
      <PageHeader title="Membership plans" count={plans?.length} />
      {isLoading && (
        <p className="loading" role="status">
          Loading…
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {describeError(error)}
        </p>
      )}

      <div className="plans-grid">
        {plans?.map((p) => {
          const style = planStyle[p.PlanName] ?? { border: '#64748b', icon: '⭐' };
          return (
            <article key={p.PlanID} className="plan-card" style={{ borderTopColor: style.border }}>
              <h2 className="plan-name">
                <span aria-hidden="true">{style.icon}</span> {p.PlanName}
              </h2>
              <p className="plan-price" style={{ color: style.border }}>
                {money(p.MonthlyFee)}
                <span>/mo</span>
              </p>
              <p className="plan-desc">{p.BenefitsDescription}</p>
              <p className="plan-footer">
                {p.AccessLevel && (
                  <span className={`badge ${accessBadge[p.AccessLevel] ?? 'badge-gray'}`}>{p.AccessLevel} access</span>
                )}
                <span className="muted">{p.MemberCount} member(s)</span>
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
