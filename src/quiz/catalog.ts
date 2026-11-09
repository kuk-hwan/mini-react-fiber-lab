export const groups = [
  {
    id: 'ive',
    name: 'IVE',
    korean: '아이브',
    mood: 'GLAM POP',
    tags: ['우아한 분위기', '또렷한 후렴'],
    description:
      '정제된 분위기와 한 번에 귀에 들어오는 후렴을 좋아한다면, 아이브의 팝 사운드부터 들어보세요.',
    song: 'LOVE DIVE',
    video: 'https://www.youtube.com/watch?v=Y8JFxS1HlDo',
  },
  {
    id: 'aespa',
    name: 'aespa',
    korean: '에스파',
    mood: 'NEON STAGE',
    tags: ['미래적인 콘셉트', '선명한 신스'],
    description:
      '새로운 세계에 들어가는 듯한 콘셉트와 전자음이 돋보이는 무대를 즐긴다면 에스파를 추천해요.',
    song: 'Drama',
    video: 'https://www.youtube.com/watch?v=D8VEhcPeSlc',
  },
  {
    id: 'seventeen',
    name: 'SEVENTEEN',
    korean: '세븐틴',
    mood: 'SUNNY POP',
    tags: ['기분 좋은 에너지', '팀워크'],
    description:
      '함께 따라 부르고 싶어지는 멜로디와 멤버들의 호흡을 보는 재미가 있는 세븐틴의 무대를 만나보세요.',
    song: '_WORLD',
    video: 'https://www.youtube.com/watch?v=VCDWg0ljbFQ',
  },
  {
    id: 'stray-kids',
    name: 'Stray Kids',
    korean: '스트레이 키즈',
    mood: 'BASS DROP',
    tags: ['강한 비트', '폭발적인 무대'],
    description:
      '묵직한 저음과 리듬이 바뀌는 순간의 쾌감을 좋아한다면 스트레이 키즈의 곡을 들어보세요.',
    song: 'MANIAC',
    video: 'https://www.youtube.com/watch?v=OvioeS1ZZ7o',
  },
  {
    id: 'le-sserafim',
    name: 'LE SSERAFIM',
    korean: '르세라핌',
    mood: 'COOL GROOVE',
    tags: ['느긋한 그루브', '절제된 퍼포먼스'],
    description:
      '힘을 뺀 듯 자연스러운 리듬과 작은 동작까지 살아 있는 무대를 좋아한다면 르세라핌이 잘 맞아요.',
    song: 'EASY',
    video: 'https://www.youtube.com/watch?v=bNKXxwOQYB8',
  },
  {
    id: 'txt',
    name: 'TXT',
    korean: '투모로우바이투게더',
    mood: 'DREAM POP',
    tags: ['몽환적인 색감', '이야기가 있는 무대'],
    description:
      '노래를 들을 때 한 장면이 떠오르는 음악이 좋다면, 멜로디와 영상에 이야기를 담는 TXT를 만나보세요.',
    song: 'Blue Hour',
    video: 'https://www.youtube.com/watch?v=Vd9QkWsd5p4',
  },
] as const;

export type Group = (typeof groups)[number];
type GroupId = Group['id'];
type Choice = { label: string; matches: readonly [GroupId, GroupId] };

function matchPoints(choice: Choice, group: GroupId): number {
  const rank = choice.matches.indexOf(group);
  return rank < 0 ? 0 : 2 - rank;
}

export const questions: readonly { title: string; choices: readonly Choice[] }[] = [
  {
    title: '재생 버튼을 누르는 순간, 어떤 음악이 끌리나요?',
    choices: [
      { label: '기분이 밝아지는 경쾌한 팝', matches: ['seventeen', 'txt'] },
      { label: '볼륨을 올리고 싶은 묵직한 비트', matches: ['stray-kids', 'aespa'] },
      { label: '몸이 가볍게 흔들리는 세련된 리듬', matches: ['le-sserafim', 'ive'] },
    ],
  },
  {
    title: '무대 영상을 볼 때 가장 먼저 눈이 가는 건?',
    choices: [
      { label: '한 장면처럼 움직이는 단체 안무', matches: ['seventeen', 'le-sserafim'] },
      { label: '등장부터 시선을 잡는 강렬한 연출', matches: ['aespa', 'stray-kids'] },
      { label: '표정과 포즈로 완성되는 포인트 안무', matches: ['ive', 'txt'] },
    ],
  },
  {
    title: '뮤직비디오의 어떤 장면이 오래 기억에 남나요?',
    choices: [
      { label: '꿈속 같은 색감과 영화처럼 이어지는 이야기', matches: ['txt', 'ive'] },
      { label: '낯선 세계를 펼치는 과감한 그래픽', matches: ['aespa', 'stray-kids'] },
      { label: '카메라를 따라 흐르는 자연스러운 움직임', matches: ['le-sserafim', 'seventeen'] },
    ],
  },
  {
    title: '플레이리스트에 자주 추가하는 곡은?',
    choices: [
      { label: '깔끔한 멜로디가 귓가에 남는 곡', matches: ['ive', 'seventeen'] },
      { label: '부드러운 리듬이라 몇 번이고 돌려 듣는 곡', matches: ['le-sserafim', 'txt'] },
      { label: '랩과 베이스가 분위기를 확 바꿔 주는 곡', matches: ['stray-kids', 'aespa'] },
    ],
  },
  {
    title: '좋아하는 그룹의 새 무대에서 기대하는 건?',
    choices: [
      { label: '관객과 같이 뛰고 따라 부를 수 있는 에너지', matches: ['seventeen', 'stray-kids'] },
      { label: '한 편의 이야기처럼 이어지는 콘셉트', matches: ['txt', 'aespa'] },
      { label: '동작과 표정에 묻어나는 여유와 자신감', matches: ['le-sserafim', 'ive'] },
    ],
  },
  {
    title: '마지막으로, 지금 듣고 싶은 한 곡의 분위기는?',
    choices: [
      { label: '반짝이는 밤처럼 우아하고 선명하게', matches: ['ive', 'aespa'] },
      { label: '공연장 한가운데처럼 크고 뜨겁게', matches: ['stray-kids', 'seventeen'] },
      { label: '해 질 무렵처럼 부드럽고 몽환적으로', matches: ['txt', 'le-sserafim'] },
    ],
  },
];

export function recommend(answers: readonly number[]) {
  if (answers.length !== questions.length) return null;

  const selected: Choice[] = [];
  for (const [index, question] of questions.entries()) {
    const choice = question.choices[answers[index]];
    if (!choice) return null;
    selected.push(choice);
  }

  const ranked = groups.map((group) => {
    const matches = selected
      .map((choice) => ({
        label: choice.label,
        points: matchPoints(choice, group.id),
      }))
      .filter(({ points }) => points > 0);
    const score = matches.reduce((total, { points }) => total + points, 0);
    return { group, score, reasons: matches.sort((a, b) => b.points - a.points).slice(0, 2) };
  });
  // With equal scores, prefer the group that matches the latest answer more strongly.
  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    for (let index = selected.length - 1; index >= 0; index--) {
      const choice = selected[index];
      const difference = matchPoints(choice, b.group.id) - matchPoints(choice, a.group.id);
      if (difference) return difference;
    }
    return 0;
  });

  const { group, reasons } = ranked[0];
  return { group, reasons: reasons.map(({ label }) => label) };
}
