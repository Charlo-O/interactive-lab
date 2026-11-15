export interface LetterPage {
  title: string;
  /** Paragraphs. Wrap a phrase in [[double brackets]] to highlight it. */
  paragraphs: string[];
  /** Sign-off lines rendered after the body. */
  signoff?: string[];
  cta?: { label: string; href: string };
}

export const envelope = {
  to: 'Mira',
  date: 'September 14, 2026',
};

export const pages: LetterPage[] = [
  {
    title: 'The umbrella you left behind',
    paragraphs: [
      'Dear Mira,',
      'Your yellow umbrella is still by my door. I was going to post it back, but yesterday it rained, and I thought you’d forgive me for borrowing it one more time.',
      'I went out for bread. That was the whole plan. At the corner, the usual bakery had a handwritten sign: [[“Back when the rain stops.”]] No time, no apology. I stood there for a minute, admiring the confidence.',
      'Then the woman from the flower stall waved me over. Her awning was collecting water in one enormous pocket. She handed me a broom and said, “You look tall enough.”',
      'I pushed the canvas up. A small lake landed on the pavement. We both jumped back, far too late.',
      'So there I was: dry head, wet shoes, no bread. You would have taken a photograph.',
    ],
  },
  {
    title: 'Tea while it rains',
    paragraphs: [
      'Her name is Bu Sari. I’ve bought flowers from her for three years and somehow only learned that yesterday.',
      'She poured tea from a dented flask into two cups that didn’t match. One said “World’s Best Dad.” She told me her daughter had brought it home from a school sale. Neither of them had noticed the words until the next morning.',
      'We sat on little plastic stools and watched the road disappear behind the rain. Every so often, she reached out to turn a bucket of flowers, as though they deserved a different view.',
      'I asked whether she minded waiting around on days like this. She said she had plenty to do, then pointed at my cup. [[“Right now, I’m having tea.”]]',
      'I stayed until the flask was empty. By then the bakery was open again, and I’d stopped checking the time.',
    ],
  },
  {
    title: 'A small thing to bring home',
    paragraphs: [
      'I bought two rolls while they were still warm. One for me, one for Bu Sari. She tried to pay, then settled for putting a single orange flower through the handle of your umbrella.',
      'It’s in a jam jar on the kitchen table now. The umbrella is back by the door, drying badly. I’ve put newspaper underneath it, which feels like something our parents would do.',
      'Nothing much happened, really. But when I got home, [[you were the person I wanted to tell.]]',
      'Come over next Sunday if you’re free. I’ll get bread before the rain starts. You can collect your umbrella, though I can’t promise there won’t be another flower attached.',
    ],
    signoff: ['With love, and slightly damp socks,', 'Rafi'],
    cta: { label: 'Back to Playground', href: '../' },
  },
];

/** Split a paragraph into plain and highlighted runs. */
export function runs(text: string): { text: string; hl: boolean }[] {
  return text
    .split(/(\[\[.+?\]\])/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('[[') ? { text: part.slice(2, -2), hl: true } : { text: part, hl: false },
    );
}
