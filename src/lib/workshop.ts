export const STAGES = [
  'lobby',
  'prompt',
  'generate',
  'submit',
  'gallery',
  'vote',
  'results',
] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_INFO: Record<Stage, { title: string; seconds: number; hint: string }> = {
  lobby: {
    title: 'Welcome to WOW',
    seconds: 60,
    hint: 'Get everyone in. Creativity is better together.',
  },
  prompt: {
    title: 'Find your sticker voice',
    seconds: 120,
    hint: 'Pick a caption, make it yours, and copy your prompt.',
  },
  generate: {
    title: 'Make a little magic',
    seconds: 360,
    hint: 'Use your own AI account, then bring your finished sticker back.',
  },
  submit: {
    title: 'Send your sticker',
    seconds: 180,
    hint: 'Upload your finished sticker for facilitator approval.',
  },
  gallery: {
    title: 'The sticker showcase',
    seconds: 60,
    hint: 'Enjoy the room’s creations. Voting is coming up.',
  },
  vote: {
    title: 'Pick your favorite',
    seconds: 120,
    hint: 'One person, one vote. Give another creator some love.',
  },
  results: {
    title: 'Meet your WOW makers',
    seconds: 0,
    hint: 'Big ideas. Tiny stickers. A room full of creativity.',
  },
};
export const COLLECTIONS = [
  {
    id: 'classroom',
    name: 'Classroom classics',
    emoji: '✏️',
    description: 'For those very teacher moments.',
    captions: [
      'Small steps. Big breakthroughs.',
      'Teacher mode: activated.',
      'That lightbulb moment!',
      'Progress over perfection.',
    ],
  },
  {
    id: 'encouragement',
    name: 'Little pep talks',
    emoji: '💛',
    description: 'A little encouragement goes a long way.',
    captions: [
      'You’ve got this!',
      'Mistakes mean you’re learning.',
      'Keep going, superstar!',
      'Your effort is showing.',
    ],
  },
  {
    id: 'staffroom',
    name: 'Staffroom energy',
    emoji: '☕',
    description: 'Your colleagues will understand.',
    captions: [
      'Powered by coffee & kindness.',
      'One more worksheet…',
      'Weekend loading…',
      'We survived Monday!',
    ],
  },
];
export const STYLES = [
  {
    id: 'clay',
    name: '3D clay',
    emoji: '🧸',
    prompt: 'playful handcrafted 3D clay, soft rounded shapes and warm studio lighting',
  },
  {
    id: 'comic',
    name: 'Pop comic',
    emoji: '💥',
    prompt: 'bold pop-art comic illustration, halftone accents and expressive shapes',
  },
  {
    id: 'kawaii',
    name: 'Kawaii',
    emoji: '🌸',
    prompt: 'adorable kawaii illustration, pastel colors and simple friendly shapes',
  },
  {
    id: 'doodle',
    name: 'Doodle',
    emoji: '〰️',
    prompt: 'cheerful hand-drawn marker doodle, textured lines and bright colors',
  },
];
export function makePrompt(caption: string, style: string, character: string) {
  const selected = STYLES.find((s) => s.id === style) ?? STYLES[0];
  return `Create one square digital sticker for a teacher workshop. Character: ${character.trim() || 'a cheerful fictional teacher mascot'}. Style: ${selected.prompt}. Include the exact caption: “${caption.trim()}”. Make the text large and legible, with a bold white die-cut border, a simple clean background, and a clear expressive pose. Keep it uplifting and suitable for a classroom. Use an original fictional character; no real person, selfie, school logo, or student information. Output only the finished sticker image.`;
}
export type Workshop = {
  id: string;
  hostId: string;
  title: string;
  code: string;
  stage: Stage;
  stageEndsAt: number;
  createdAt: number;
  expiresAt: number;
  participantCount: number;
  winners?: { id: string; nickname: string; votes: number; rank: number }[];
  totalVotes?: number;
};
export type Member = { id: string; nickname: string; progress: string; joinedAt: number };
export type Submission = {
  id: string;
  nickname: string;
  caption: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  reason?: string;
};
export function nextStage(stage: Stage) {
  return STAGES[STAGES.indexOf(stage) + 1] ?? null;
}
export function rankVotes(
  submissions: { id: string; nickname: string }[],
  votes: { submissionId: string }[],
) {
  const totals = new Map<string, number>();
  for (const v of votes) totals.set(v.submissionId, (totals.get(v.submissionId) ?? 0) + 1);
  let previous = -1,
    rank = 0;
  return submissions
    .map((s) => ({ ...s, votes: totals.get(s.id) ?? 0 }))
    .filter((s) => s.votes > 0)
    .sort((a, b) => b.votes - a.votes || a.id.localeCompare(b.id))
    .map((s, i) => {
      if (s.votes !== previous) rank = i + 1;
      previous = s.votes;
      return { ...s, rank };
    })
    .filter((s) => s.rank <= 3);
}
