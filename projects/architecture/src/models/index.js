import { createGeometryToolkit } from '../core/geometry.js';
import { buildZhaozhou } from './zhaozhou.js';
import { buildTulou } from './tulou.js';
import { buildXuankong } from './xuankong.js';
import { buildYingxian } from './yingxian.js';
import { buildTiantan } from './tiantan.js';

export const MODEL_IDS = Object.freeze(['zhaozhou', 'tulou', 'xuankong', 'yingxian', 'tiantan']);

/** 延迟构建：只有选中的建筑才生成几何；缓存由页面管理。 */
export function createModelBuilders(materials) {
  const toolkit = createGeometryToolkit(materials);
  return {
    zhaozhou: () => buildZhaozhou(toolkit),
    tulou: () => buildTulou(toolkit),
    xuankong: () => buildXuankong(toolkit),
    yingxian: () => buildYingxian(toolkit),
    tiantan: () => buildTiantan(toolkit),
  };
}
