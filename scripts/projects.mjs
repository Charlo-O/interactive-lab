export const projects = [
  { slug: 'ripples', title: '纸上涟漪', en: 'Ripples on paper', description: '写几个字，换一张纸，让水纹替你传递心绪。', gesture: '输入 · 换纸 · 盖章', color: '#e5ebe1' },
  { slug: 'letter', title: '手撕信封', en: 'A letter for you', description: '沿着封口轻轻撕开，展开一封慢慢读的信。', gesture: '拖动 · 撕开 · 翻页', color: '#eee5d8' },
  { slug: 'watercat', title: '水猫', en: 'A little liquid life', description: '玻璃杯里住着一只猫。摸摸它，也试着摇摇杯子。', gesture: '抚摸 · 逗猫 · 摇晃', color: '#dfedf4' },
  { slug: 'architecture', title: '古建筑构造图', en: 'Built, piece by piece', description: '看五座中国古建筑逐层搭起，转个角度，走进结构。', gesture: '旋转 · 搭建 · 剖切', color: '#e9e7de' },
  { slug: 'glass-wheel', title: '玻璃轮盘', en: 'A different kind of time', description: '轻拨花瓣，让光线、玻璃与时间一起转动。', gesture: '拖动 · 转动 · 吸附', color: '#dddfe8' },
  { slug: 'whole-circle', title: '全年圆环', en: 'The whole circle', description: '转动一整年的日子，按住，再看文字散开与重聚。', gesture: '旋转 · 长按 · 重组', color: '#e8e5db' },
  { slug: 'dither-motion', title: '抖动生物', en: 'Dither & motion', description: '锦鲤、海龟与蜥蜴，由细小的色点组成，也会回应你。', gesture: '移动 · 点按 · 切换', color: '#e5eade' },
  { slug: 'autumn', title: '秋叶字体', en: 'A passing autumn', description: '吹散一阵秋天，再等叶子与字母慢慢回到原处。', gesture: '点按 · 吹散 · 聚拢', color: '#eee0cf' },
];

export function basePath(value = process.env.LAB_BASE_PATH ?? '/interactive-lab/') {
  const parts = value.split('/').filter(Boolean);
  if (parts.some(part => !/^[\w-]+$/.test(part))) throw new Error('Invalid LAB_BASE_PATH');
  return '/' + (parts.length ? parts.join('/') + '/' : '');
}
