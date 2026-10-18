export type HealthLevel = 'good' | 'warning' | 'heavy'

export type MetricId =
  | 'bones'
  | 'slots'
  | 'activeVertices'
  | 'activeTriangles'
  | 'totalVertices'
  | 'meshes'
  | 'weightedInfluences'
  | 'clipping'
  | 'ikConstraints'
  | 'transformConstraints'
  | 'pathConstraints'
  | 'physicsConstraints'
  | 'atlasPages'
  | 'drawCalls'
  | 'animations'

export interface Budget {
  readonly good: number
  readonly warning: number
}

export interface MetricDefinition {
  readonly id: MetricId
  readonly label: string
  readonly description: string
  readonly budget: Budget
}

export const MOBILE_BUDGETS: readonly MetricDefinition[] = [
  { id: 'bones', label: '骨骼數', description: '每幀世界變換計算量', budget: { good: 60, warning: 100 } },
  { id: 'slots', label: '插槽數', description: '繪製順序與部件切換成本', budget: { good: 60, warning: 100 } },
  { id: 'activeVertices', label: '目前頂點數', description: '目前姿勢實際送入 GPU 的頂點', budget: { good: 800, warning: 1500 } },
  { id: 'activeTriangles', label: '目前三角面數', description: '目前姿勢的三角面數', budget: { good: 600, warning: 1200 } },
  { id: 'totalVertices', label: '資產總頂點數', description: '所有皮膚所有部件的頂點總和', budget: { good: 3000, warning: 6000 } },
  { id: 'meshes', label: '網格部件數', description: 'MeshAttachment 數量', budget: { good: 20, warning: 40 } },
  { id: 'weightedInfluences', label: '權重影響數', description: '加權網格的骨骼影響總數，CPU 蒙皮成本', budget: { good: 2000, warning: 4000 } },
  { id: 'clipping', label: '裁切部件數', description: 'ClippingAttachment 會逐三角形裁切並打斷批次', budget: { good: 0, warning: 2 } },
  { id: 'ikConstraints', label: 'IK 限制器數', description: 'IkConstraint 數量', budget: { good: 8, warning: 16 } },
  { id: 'transformConstraints', label: 'Transform 限制器數', description: 'TransformConstraint 數量', budget: { good: 8, warning: 16 } },
  { id: 'pathConstraints', label: 'Path 限制器數', description: 'PathConstraint 數量', budget: { good: 2, warning: 5 } },
  { id: 'physicsConstraints', label: '物理限制器數', description: 'PhysicsConstraint 數量', budget: { good: 4, warning: 10 } },
  { id: 'atlasPages', label: '圖集頁數', description: '貼圖數量與記憶體、切換成本', budget: { good: 1, warning: 3 } },
  { id: 'drawCalls', label: '預估繪製批次', description: '目前姿勢依貼圖與混合模式切換估算的批次數', budget: { good: 3, warning: 6 } },
  { id: 'animations', label: '動畫數', description: '載入與記憶體成本', budget: { good: 40, warning: 80 } },
]

export function levelFor(value: number, budget: Budget): HealthLevel {
  if (value <= budget.good) return 'good'
  if (value <= budget.warning) return 'warning'
  return 'heavy'
}

const ORDER: Record<HealthLevel, number> = { good: 0, warning: 1, heavy: 2 }

export function worstLevel(levels: readonly HealthLevel[]): HealthLevel {
  return levels.reduce<HealthLevel>((worst, level) => (ORDER[level] > ORDER[worst] ? level : worst), 'good')
}

export const LEVEL_LABEL: Record<HealthLevel, string> = { good: '優良', warning: '警告', heavy: '過重' }
