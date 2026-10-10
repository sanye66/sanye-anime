/**
 * 作品标题归一化键。
 *
 * 来源标题常只差标点或空白（「你的名字。」与「你的名字」「Fate／stay night」与「Fate/stay night」），
 * 用它把来源作品对到随包目录里的同名作品，PC 与安卓共用同一套规则。
 */
export function titleKey(value?: string | null): string {
  return (value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}
