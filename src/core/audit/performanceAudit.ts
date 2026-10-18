import {
  BlendMode,
  ClippingAttachment,
  MeshAttachment,
  RegionAttachment,
  type Attachment,
  type Skeleton,
  type SkeletonData,
} from '@esotericsoftware/spine-core'
import { LEVEL_LABEL, MOBILE_BUDGETS, levelFor, worstLevel, type HealthLevel, type MetricDefinition, type MetricId } from './budgets'

export interface AuditMetric {
  readonly id: MetricId
  readonly label: string
  readonly description: string
  readonly value: number
  readonly good: number
  readonly warning: number
  readonly level: HealthLevel
}

export interface AuditReport {
  readonly grade: HealthLevel
  readonly gradeLabel: string
  readonly metrics: readonly AuditMetric[]
  readonly counts: Record<HealthLevel, number>
  readonly findings: readonly string[]
}

export function renderedVertexCount(attachment: Attachment | null): number {
  if (attachment instanceof RegionAttachment) return 4
  if (attachment instanceof MeshAttachment) return attachment.worldVerticesLength / 2
  return 0
}

export function renderedTriangleCount(attachment: Attachment | null): number {
  if (attachment instanceof RegionAttachment) return 2
  if (attachment instanceof MeshAttachment) return attachment.triangles.length / 3
  return 0
}

export function weightedInfluences(mesh: MeshAttachment): number {
  if (!mesh.bones) return 0
  const vertexCount = mesh.worldVerticesLength / 2
  return mesh.bones.length - vertexCount
}

export interface StaticMetrics {
  readonly totalVertices: number
  readonly meshes: number
  readonly weightedMeshes: number
  readonly weightedInfluences: number
  readonly clipping: number
  readonly attachments: number
}

export function staticMetrics(data: SkeletonData): StaticMetrics {
  const seen = new Set<Attachment>()
  let totalVertices = 0
  let meshes = 0
  let weightedMeshes = 0
  let influences = 0
  let clipping = 0
  for (const skin of data.skins) {
    for (const entry of skin.getAttachments()) {
      const attachment = entry.attachment
      if (seen.has(attachment)) continue
      seen.add(attachment)
      totalVertices += renderedVertexCount(attachment)
      if (attachment instanceof MeshAttachment) {
        meshes += 1
        const weight = weightedInfluences(attachment)
        if (weight > 0) weightedMeshes += 1
        influences += weight
      } else if (attachment instanceof ClippingAttachment) {
        clipping += 1
      }
    }
  }
  return { totalVertices, meshes, weightedMeshes, weightedInfluences: influences, clipping, attachments: seen.size }
}

export interface PoseMetrics {
  readonly activeVertices: number
  readonly activeTriangles: number
  readonly drawCalls: number
  readonly visibleAttachments: number
}

export function poseMetrics(skeleton: Skeleton): PoseMetrics {
  let activeVertices = 0
  let activeTriangles = 0
  let drawCalls = 0
  let visibleAttachments = 0
  let lastTexture: unknown = undefined
  let lastBlend: BlendMode | undefined
  let clipping = false
  for (const slot of skeleton.drawOrder) {
    if (!slot.bone.active) continue
    const attachment = slot.getAttachment()
    if (attachment instanceof ClippingAttachment) {
      clipping = true
      continue
    }
    if (!(attachment instanceof RegionAttachment) && !(attachment instanceof MeshAttachment)) continue
    if (slot.color.a === 0 || attachment.color.a === 0) continue
    visibleAttachments += 1
    activeVertices += renderedVertexCount(attachment)
    activeTriangles += renderedTriangleCount(attachment)
    const texture = attachment.region?.texture
    const blend = slot.data.blendMode
    if (texture !== lastTexture || blend !== lastBlend || clipping) {
      drawCalls += 1
      lastTexture = texture
      lastBlend = blend
      clipping = false
    }
  }
  return { activeVertices, activeTriangles, drawCalls, visibleAttachments }
}

export function buildMetric(definition: MetricDefinition, value: number): AuditMetric {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    value,
    good: definition.budget.good,
    warning: definition.budget.warning,
    level: levelFor(value, definition.budget),
  }
}

export function auditSkeleton(data: SkeletonData, skeleton: Skeleton, atlasPages: number, budgets: readonly MetricDefinition[] = MOBILE_BUDGETS): AuditReport {
  const fixed = staticMetrics(data)
  const pose = poseMetrics(skeleton)
  const values: Record<MetricId, number> = {
    bones: data.bones.length,
    slots: data.slots.length,
    activeVertices: pose.activeVertices,
    activeTriangles: pose.activeTriangles,
    totalVertices: fixed.totalVertices,
    meshes: fixed.meshes,
    weightedInfluences: fixed.weightedInfluences,
    clipping: fixed.clipping,
    ikConstraints: data.ikConstraints.length,
    transformConstraints: data.transformConstraints.length,
    pathConstraints: data.pathConstraints.length,
    physicsConstraints: data.physicsConstraints.length,
    atlasPages,
    drawCalls: pose.drawCalls,
    animations: data.animations.length,
  }
  const metrics = budgets.map((definition) => buildMetric(definition, values[definition.id]))
  const counts: Record<HealthLevel, number> = { good: 0, warning: 0, heavy: 0 }
  for (const metric of metrics) counts[metric.level] += 1
  const grade = worstLevel(metrics.map((metric) => metric.level))
  const findings = metrics
    .filter((metric) => metric.level !== 'good')
    .map((metric) => `${metric.label} = ${metric.value}，${LEVEL_LABEL[metric.level]}（優良上限 ${metric.good}，警告上限 ${metric.warning}）`)
  return { grade, gradeLabel: LEVEL_LABEL[grade], metrics, counts, findings }
}
