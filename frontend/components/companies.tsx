"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FollowCompanyButton } from "@/components/follow-company-button";
import { fetchCompanies, fetchFollowedCompanyIds, fetchPriorityCompanyIds } from "@/lib/data";
import { MAX_PRIORITY_COMPANIES } from "@/lib/notifications";
import type { Company } from "@/lib/types";

/** Follow companies for a default digest, or prioritize up to 10 of them for
 * instant alerts. Notification cadence itself is configured in Settings. */
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

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? companies.filter((company) => company.name.toLowerCase().includes(term)) : companies;
  }, [companies, search]);

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
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>
            Follow any number of companies for a default digest. Prioritize up to {MAX_PRIORITY_COMPANIES} of them
            for an instant email the moment they post. Notification cadence is in Settings.
            {" "}{priorityIds.length} / {MAX_PRIORITY_COMPANIES} prioritized.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading ? <p role="status" className="text-sm text-muted-foreground">Loading companies…</p> : null}
          {!loading ? (
            <>
              <Input
                aria-label="Find a company"
                placeholder="Find a company"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="grid gap-2">
                {filteredCompanies.map((company) => (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border p-2" key={company.id}>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{company.name}</span>
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
