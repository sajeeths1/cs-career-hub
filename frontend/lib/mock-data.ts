import {
  Briefcase,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  Target,
  UserRound,
} from "lucide-react";

export const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Jobs", icon: Briefcase },
  { label: "Applications", icon: ClipboardList },
  { label: "Skills", icon: Target },
  { label: "Profile", icon: UserRound },
];

export const metrics = [
  { label: "Matched roles", value: "24", note: "6 new this week" },
  { label: "Saved jobs", value: "8", note: "4 closing soon" },
  { label: "Applications", value: "12", note: "3 interviews pending" },
  { label: "Profile strength", value: "86%", note: "Resume ready" },
];

export const jobs = [
  {
    title: "Software Engineer Intern",
    company: "Redwood Systems",
    location: "Raleigh, NC",
    posted: "Posted 2 days ago",
    match: 92,
    tags: ["React", "TypeScript", "APIs", "Git"],
    description:
      "Build polished product interfaces with a collaborative engineering team. You will work on reusable components, accessibility improvements, and internal dashboard workflows.",
  },
  {
    title: "Frontend Developer Intern",
    company: "BrightLoop",
    location: "Remote",
    posted: "Posted 4 days ago",
    match: 87,
    tags: ["Next.js", "Tailwind", "Testing"],
    description:
      "Ship responsive web features for customer-facing tools and partner with designers to turn mockups into accessible production UI.",
  },
  {
    title: "Data Analyst Intern",
    company: "MetroTech",
    location: "Charlotte, NC",
    posted: "Posted 1 week ago",
    match: 81,
    tags: ["SQL", "Python", "Dashboards"],
    description:
      "Analyze product and operations data, build dashboards, and communicate insights to technical and non-technical teammates.",
  },
];

export const skillDemand = [
  { skill: "Python", score: 86 },
  { skill: "React", score: 78 },
  { skill: "SQL", score: 71 },
  { skill: "AWS", score: 54 },
];

export const applicationColumns = [
  {
    status: "Saved",
    cards: [
      { title: "Software Engineer Intern", meta: "Due Friday" },
      { title: "Web Platform Intern", meta: "New" },
    ],
  },
  {
    status: "Applied",
    cards: [
      { title: "Frontend Developer Intern", meta: "Submitted" },
      { title: "Data Analyst Intern", meta: "Reviewing" },
    ],
  },
  {
    status: "Interview",
    cards: [{ title: "Product Engineering Co-op", meta: "Oct 8" }],
  },
];

export const checklistItems = [
  "Strong overlap with your frontend coursework and projects.",
  "Uses React, JavaScript, and API integration experience.",
  "Located near your preferred North Carolina search area.",
];

export const profileDefaults = {
  name: "Atharva Tijare",
  major: "Computer Science",
  location: "Raleigh, NC or Remote",
  roles: "Software engineering, frontend, data",
};

export const completedSetup = [
  "Portfolio link added",
  "Three target roles selected",
  "Job alerts enabled",
].map((label) => ({ label, icon: CheckCircle2 }));
