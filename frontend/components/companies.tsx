"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FollowCompanyButton } from "@/components/follow-company-button";
import { fetchCompanies, fetchFollowedCompanyIds, fetchPriorityCompanyIds } from "@/lib/data";
import { MAX_PRIORITY_COMPANIES } from "@/lib/notifications";
import type { Company } from "@/lib/types";

/** Follow companies for a digest, or put up to 10 on the instant list for
 * instant alerts. Email timing is set in NotificationSettingsTab. */
export function CompaniesTab({ userId }: { userId: string }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [followedIds, setFollowedIds] = useState<number[]>([]);
  const [priorityIds, setPriorityIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchCompanies(), fetchFollowedCompanyIds(userId), fetchPriorityCompanyIds(userId)])
      .then(([companyRows, followed, priority]) => {
        if (!active) return;
        setCompanies(companyRows);
        setFollowedIds(followed);
        setPriorityIds(priority);
      })
      .catch((err: Error) => { if (active) setLoadError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, attempt]);

  // Instant-list companies first, then followed ones, then the rest (each group A–Z, as loaded).
  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rank = (id: number) => (priorityIds.includes(id) ? 0 : followedIds.includes(id) ? 1 : 2);
    return (term ? companies.filter((company) => company.name.toLowerCase().includes(term)) : companies)
      .slice()
      .sort((a, b) => rank(a.id) - rank(b.id));
  }, [companies, search, priorityIds, followedIds]);

  function handleFollowToggled(companyId: number, following: boolean) {
    setFollowedIds((ids) => (following ? [...ids, companyId] : ids.filter((id) => id !== companyId)));
    // Unfollowing also drops priority status server-side; mirror that locally.
    if (!following) setPriorityIds((ids) => ids.filter((id) => id !== companyId));
  }

  function handlePriorityToggled(companyId: number, priority: boolean) {
    setPriorityIds((ids) => (priority ? [...ids, companyId] : ids.filter((id) => id !== companyId)));
    // Marking a company priority also follows it server-side; mirror that locally.
    if (priority) setFollowedIds((ids) => (ids.includes(companyId) ? ids : [...ids, companyId]));
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      {loadError ? (
        <div role="alert" className="grid gap-2 text-sm text-red-600">
          <p>Could not load companies: {loadError}</p>
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Companies</CardTitle>
              <CardDescription className="mt-1 max-w-xl leading-relaxed">
                Follow companies to get their new jobs in a digest. Add up to {MAX_PRIORITY_COMPANIES} to your instant
                list to get an email the moment they post.
              </CardDescription>
            </div>
            <span className="whitespace-nowrap text-[13px] font-semibold text-foreground/80">
              {priorityIds.length} of {MAX_PRIORITY_COMPANIES} instant · {followedIds.length} followed
            </span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-muted" aria-hidden="true">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, (priorityIds.length / MAX_PRIORITY_COMPANIES) * 100)}%` }} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading ? <p role="status" className="text-sm text-muted-foreground">Loading companies…</p> : null}
          {!loading ? (
            <>
              <Input
                aria-label="Find a company"
                placeholder="Search companies"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="max-h-[360px] overflow-y-auto pr-1">
                {filteredCompanies.map((company) => (
                  <div className="flex flex-wrap items-center gap-2 border-t py-2.5 first:border-t-0" key={company.id}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-[13px] font-bold text-foreground/80" aria-hidden="true">
                      {company.name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{company.name}</span>
                    <FollowCompanyButton
                      companyId={company.id}
                      companyName={company.name}
                      isActive={followedIds.includes(company.id)}
                      mode="follow"
                      onToggled={handleFollowToggled}
                      userId={userId}
                    />
                    <FollowCompanyButton
                      companyId={company.id}
                      companyName={company.name}
                      isActive={priorityIds.includes(company.id)}
                      mode="priority"
                      onToggled={handlePriorityToggled}
                      userId={userId}
                    />
                  </div>
                ))}
              </div>
              {filteredCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No companies match this search.</p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
