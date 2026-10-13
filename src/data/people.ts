import type { Person, Project } from '../lib/types';

/** The signed-in manager. All "waiting on you" signals point at this person. */
export const ME = 'neha';

export const WORKSPACE = {
  company: 'Airtribe',
  team: 'Learning Platform',
};

export const PEOPLE: Person[] = [
  { id: 'neha', name: 'Neha Kapoor', role: 'Engineering Manager', hue: 168, email: 'neha@airtribe.example' },
  { id: 'rahul', name: 'Rahul Verma', role: 'Senior Frontend Engineer', hue: 214, skills: ['frontend', 'learner-web', 'notifications', 'career'] },
  { id: 'ananya', name: 'Ananya Iyer', role: 'Backend Engineer', hue: 330, skills: ['backend', 'grading', 'payments', 'api'] },
  { id: 'karan', name: 'Karan Mehta', role: 'Full-stack Engineer', hue: 26, skills: ['live-sessions', 'video', 'mentor-connect', 'api'] },
  { id: 'sneha', name: 'Sneha Reddy', role: 'QA Engineer', hue: 280, skills: ['qa', 'e2e', 'release'] },
  { id: 'arjun', name: 'Arjun Nair', role: 'Platform Engineer', hue: 196, skills: ['infra', 'payments', 'security', 'devops'] },
  { id: 'meera', name: 'Meera Joshi', role: 'Product Designer', hue: 350, skills: ['design', 'copy', 'career'] },
  { id: 'vikram', name: 'Vikram Rao', role: 'Data Engineer', hue: 46, skills: ['data', 'analytics', 'leaderboard'] },
  { id: 'ishita', name: 'Ishita Das', role: 'Program Manager', hue: 128, skills: ['programs', 'mentors', 'learners'] },
  // People outside the team who show up in threads and emails.
  { id: 'rohan', name: 'Rohan Bhatia', role: 'Head of Product', external: true, hue: 240, email: 'rohan@airtribe.example' },
  { id: 'priya', name: 'Priya Menon', role: 'Learner Success Lead', external: true, hue: 300, email: 'priya@airtribe.example' },
  { id: 'aakash', name: 'Aakash Gupta', role: 'Mentor Lead', external: true, hue: 90, email: 'aakash@airtribe.example' },
  { id: 'tanvi', name: 'Tanvi Shah', role: 'Marketing Manager', external: true, hue: 12, email: 'tanvi@airtribe.example' },
  { id: 'kavya', name: 'Kavya Pillai', role: 'Finance Partner', external: true, hue: 180, email: 'kavya@airtribe.example' },
  { id: 'sameer', name: 'Sameer Kulkarni', role: 'Partnerships, TalentBridge', external: true, hue: 60, email: 'sameer@talentbridge.example' },
  { id: 'dependabot', name: 'Dependabot', role: 'Automated updates', external: true, hue: 200 },
  { id: 'ci', name: 'Release bot', role: 'CI/CD', external: true, hue: 160 },
];

export const PROJECTS: Project[] = [
  { id: 'live', name: 'Live sessions', about: 'Joining, video and captions for live classes' },
  { id: 'review', name: 'Assignment review 2.0', about: 'AI-assisted feedback on project submissions' },
  { id: 'launchpad', name: 'GenAI Launchpad launch', about: 'Enrollment, payments and landing page for the new program' },
  { id: 'mentor', name: 'Mentor Connect', about: 'Booking doubt-solving sessions with mentors' },
  { id: 'career', name: 'Career hub', about: 'Job board, resume builder and partner roles' },
  { id: 'platform', name: 'Platform', about: 'Infrastructure, security, CI and cost' },
];

const byId = new Map(PEOPLE.map((p) => [p.id, p]));
export const person = (id?: string | null): Person | undefined => (id ? byId.get(id) : undefined);
export const personName = (id?: string | null) => person(id)?.name ?? 'Unassigned';
export const firstName = (id?: string | null) => personName(id).split(' ')[0];
export const TEAM = PEOPLE.filter((p) => !p.external && p.id !== ME);

const projectById = new Map(PROJECTS.map((p) => [p.id, p]));
export const project = (id: string) => projectById.get(id);
