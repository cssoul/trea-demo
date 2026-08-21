export type SectionLayout = 'left' | 'right' | 'top' | 'overlay'

export interface Section {
  id: number
  name: string
  /** 中文 tag，用在导航 */
  tag: string
  /** 小标识，比如 "01 / COURT" */
  eyebrow: string
  /** 主标题（英文大写，配合视觉冲击力） */
  title: string
  /** 主标题旁的中文注释（用于类型变化） */
  titleCN: string
  /** 描述文案 */
  description: string
  /** 按钮文案 */
  buttonText: string
  /** 主视觉图片 */
  image: string
  /** 与下一个 section 之间的过渡视频序号 (1-based)；最后一个为 -1 */
  transitionVideo: number
  /** 背景渐变 */
  bgGradient: string
  /** 主题色 */
  accent: string
  /** 暗色主题 */
  dark: boolean
  /** 布局 */
  layout: SectionLayout
}

export interface NavItem {
  index: number
  label: string
  en: string
}

export const sections: Section[] = [
  {
    id: 0,
    name: 'tennis',
    tag: '网球',
    eyebrow: '01 / TENNIS COURT',
    title: 'SWING IT.',
    titleCN: '挥拍制胜',
    description: '阳光洒在红土场，少年土豆一个漂亮的挥拍——这是心跳的回响，也是土豆最得意的瞬间。',
    buttonText: 'START PLAYING',
    image: '/pic/1.png',
    transitionVideo: 1,
    bgGradient:
      'linear-gradient(135deg, #FFEFBA 0%, #FFD180 35%, #FFA45B 75%, #FF6F61 100%)',
    accent: '#FF5C39',
    dark: false,
    layout: 'left',
  },
  {
    id: 1,
    name: 'swim',
    tag: '游泳',
    eyebrow: '02 / SWIMMING POOL',
    title: 'DIVE IN.',
    titleCN: '潜入深蓝',
    description: '纵身入水的那一刻，整个世界都安静了。只有土豆与浪花共舞，把夏天藏进每个气泡里。',
    buttonText: 'START SWIMMING',
    image: '/pic/2.png',
    transitionVideo: 2,
    bgGradient:
      'linear-gradient(135deg, #C2E9FB 0%, #7FCFF7 45%, #2D9CDB 100%)',
    accent: '#22D3EE',
    dark: false,
    layout: 'right',
  },
  {
    id: 2,
    name: 'hoops',
    tag: '篮球',
    eyebrow: '03 / BASKETBALL COURT',
    title: 'SLAM DUNK.',
    titleCN: '暴扣时刻',
    description: '起跳、滞空、暴扣——土豆从不解释这一瞬间，篮筐会替他说话。球场上永远不缺喝彩。',
    buttonText: 'JOIN THE TEAM',
    image: '/pic/3.png',
    transitionVideo: 3,
    bgGradient:
      'linear-gradient(135deg, #FFE9C4 0%, #FFB36B 45%, #E85D2C 100%)',
    accent: '#F97316',
    dark: true,
    layout: 'top',
  },
  {
    id: 3,
    name: 'ski',
    tag: '滑雪',
    eyebrow: '04 / SNOW PEAK',
    title: 'RIDE PEAK.',
    titleCN: '雪域疾驰',
    description: '白雪皑皑，山风呼啸。土豆系紧滑雪板，整片山巅——都属于他。',
    buttonText: 'BEGIN ADVENTURE',
    image: '/pic/4.png',
    transitionVideo: -1,
    bgGradient:
      'linear-gradient(180deg, #E8F4FF 0%, #B6DDF7 45%, #4F86C6 100%)',
    accent: '#0EA5E9',
    dark: false,
    layout: 'overlay',
  },
]

export const navItems: NavItem[] = sections.map((s) => ({
  index: s.id,
  label: s.tag,
  en: s.name.toUpperCase(),
}))

/** transitionVideoIndex (0-based) of the video that should play between two section indices */
export function transitionVideoIndexBetween(a: number, b: number): number {
  return Math.min(a, b)
}
