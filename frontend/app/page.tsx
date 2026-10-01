"use client";

import {
  Bell,
  Bookmark,
  Check,
  ExternalLink,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/profile-form";
import { ResumeUpload } from "@/components/resume-upload";
import {
  applicationColumns,
  checklistItems,
  completedSetup,
  jobs,
  metrics,
  navItems,
  skillDemand,
} from "@/lib/mock-data";

export default function Home() {
  const featuredJob = jobs[0];

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-card px-4 py-5 lg:flex lg:flex-col">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            CH
          </div>
          <div>
            <p className="font-semibold">CS Career Hub</p>
            <p className="text-xs text-muted-foreground">Student workspace</p>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item, index) => (
            <a
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                index === 0
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              href={`#${item.label.toLowerCase()}`}
              key={item.label}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </a>
          ))}
        </nav>
        <Button className="mt-auto justify-start" variant="outline">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <div className="relative max-w-xl flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input className="pl-9" placeholder="Search jobs, companies, or skills" />
          </div>
          <Button size="icon" variant="outline" aria-label="Filters">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="icon" variant="outline" aria-label="Notifications">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>

        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6">
          <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Student dashboard</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Find the next role worth applying to
              </h1>
            </div>
            <Button>
              <Bookmark className="h-4 w-4" aria-hidden="true" />
              Track application
            </Button>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <Card key={metric.label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 text-3xl font-semibold">{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <Tabs defaultValue="dashboard" className="space-y-5">
            <TabsList className="max-w-full overflow-x-auto">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="applications">Applications</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="profile">Profile</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Top matches</CardTitle>
                    <CardDescription>
                      Ranked from mock frontend data for the first prototype.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm">View all</Button>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {jobs.map((job) => (
                    <JobRow key={job.title} job={job} />
                  ))}
                </CardContent>
              </Card>
              <div className="grid gap-6">
                <ResumeUpload compact />
                <Card>
                  <CardHeader>
                    <CardTitle>Setup checklist</CardTitle>
                    <CardDescription>Prototype-only profile progress.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {completedSetup.map((item) => (
                      <div className="flex items-center gap-3 text-sm" key={item.label}>
                        <item.icon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        {item.label}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="jobs" className="grid gap-6 xl:grid-cols-[1fr_340px]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{featuredJob.title}</CardTitle>
                      <CardDescription>
                        {featuredJob.company} · {featuredJob.location} · {featuredJob.posted}
                      </CardDescription>
                    </div>
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      {featuredJob.match}% match
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {featuredJob.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">Job description</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {featuredJob.description}
                    </p>
                  </section>
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold">Why this matches you</h2>
                    {checklistItems.map((item) => (
                      <div className="flex gap-3 text-sm" key={item}>
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </section>
                  <div className="flex flex-wrap gap-3">
                    <Button>Track application</Button>
                    <Button variant="outline">Save job</Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Similar jobs</CardTitle>
                  <CardDescription>Quick scan of related roles.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {jobs.slice(1).map((job) => (
                    <JobRow compact key={job.title} job={job} />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="applications">
              <Card>
                <CardHeader>
                  <CardTitle>Application tracker</CardTitle>
                  <CardDescription>
                    Kanban-style frontend mockup for your group&apos;s UI handoff.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  {applicationColumns.map((column) => (
                    <section className="rounded-lg border bg-muted/35 p-3" key={column.status}>
                      <h2 className="mb-3 text-sm font-semibold">{column.status}</h2>
                      <div className="grid gap-3">
                        {column.cards.map((card) => (
                          <article className="rounded-md border bg-card p-3 text-sm" key={card.title}>
                            <p className="font-medium">{card.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{card.meta}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="skills">
              <Card>
                <CardHeader>
                  <CardTitle>Skills employers want</CardTitle>
                  <CardDescription>
                    Frontend mock demand scores to match the Figma direction.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {skillDemand.map((skill) => (
                    <div className="grid gap-2 sm:grid-cols-[140px_1fr_48px] sm:items-center" key={skill.skill}>
                      <span className="text-sm font-medium">{skill.skill}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${skill.score}%` }} />
                      </div>
                      <span className="text-sm font-semibold">{skill.score}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="profile" className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader>
                  <CardTitle>Your profile</CardTitle>
                  <CardDescription>
                    React Hook Form and Zod validation, with no backend submit.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ProfileForm />
                </CardContent>
              </Card>
              <ResumeUpload compact />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </main>
  );
}

function JobRow({
  job,
  compact = false,
}: {
  job: (typeof jobs)[number];
  compact?: boolean;
}) {
  return (
    <article className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold">{job.title}</h3>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {job.company} · {job.location}
        </p>
        {!compact ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {job.tags.slice(0, 3).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
          {job.match}%
        </Badge>
        <Button size="sm" variant="outline">Save</Button>
      </div>
    </article>
  );
}
