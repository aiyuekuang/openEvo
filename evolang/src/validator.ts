// ═══════════════════════════════════════════════════════════════
// evolang/src/validator.ts — JSON Schema 校验引擎 + 自修复报告
// ═══════════════════════════════════════════════════════════════

import type { JSONSchema, ValidationViolation, ValidationReport } from './types'

/**
 * 校验数据是否符合 JSON Schema
 * 返回违规列表（空数组 = 通过）
 */
export function validateSchema(
  data: unknown,
  schema: JSONSchema,
  path = '',
): ValidationViolation[] {
  const violations: ValidationViolation[] = []

  if (!schema || Object.keys(schema).length === 0) {
    return violations
  }

  const currentPath = path || '(root)'

  // 类型检查
  if (schema.type) {
    const actualType = getJSONType(data)
    if (actualType !== schema.type) {
      violations.push({
        path: currentPath,
        rule: 'type',
        expected: schema.type as string,
        actual: data,
        suggestion: `期望类型为 ${schema.type}，实际为 ${actualType}`,
      })
      return violations
    }
  }

  // 对象属性检查
  if (schema.type === 'object' && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    const properties = (schema.properties || {}) as Record<string, JSONSchema>
    const required = (schema.required || []) as string[]

    for (const key of required) {
      if (!(key in obj) || obj[key] === undefined) {
        const propSchema = properties[key]
        violations.push({
          path: path ? `${path}.${key}` : key,
          rule: 'required',
          expected: `必须提供 "${key}" 字段`,
          actual: undefined,
          suggestion: propSchema?.description
            ? `请提供 ${key}（${propSchema.description}）`
            : `请提供 ${key} 字段`,
        })
      }
    }

    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in obj && obj[key] !== undefined) {
        // 跳过 $resolve / $returnSkill 声明的属性（运行时动态注入，类型不一定匹配 JSONSchema）
        if (propSchema.$resolve || propSchema.$returnSkill) continue
        const childPath = path ? `${path}.${key}` : key
        violations.push(...validateSchema(obj[key], propSchema, childPath))
      }
    }
  }

  // 数组元素检查
  if (schema.type === 'array' && Array.isArray(data) && schema.items) {
    const itemSchema = schema.items as JSONSchema
    for (let i = 0; i < data.length; i++) {
      violations.push(...validateSchema(data[i], itemSchema, `${currentPath}[${i}]`))
    }
  }

  // 枚举检查
  if (schema.enum && !(schema.enum as unknown[]).includes(data)) {
    violations.push({
      path: currentPath,
      rule: 'enum',
      expected: `值必须是: ${(schema.enum as unknown[]).join(', ')}`,
      actual: data,
      suggestion: `请从 [${(schema.enum as unknown[]).join(', ')}] 中选择`,
    })
  }

  // 数值范围
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < (schema.minimum as number)) {
      violations.push({
        path: currentPath, rule: 'minimum',
        expected: `>= ${schema.minimum}`, actual: data,
        suggestion: `不能小于 ${schema.minimum}`,
      })
    }
    if (schema.maximum !== undefined && data > (schema.maximum as number)) {
      violations.push({
        path: currentPath, rule: 'maximum',
        expected: `<= ${schema.maximum}`, actual: data,
        suggestion: `不能大于 ${schema.maximum}`,
      })
    }
  }

  // 字符串长度
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < (schema.minLength as number)) {
      violations.push({
        path: currentPath, rule: 'minLength',
        expected: `长度 >= ${schema.minLength}`, actual: data,
        suggestion: `至少 ${schema.minLength} 个字符`,
      })
    }
    if (schema.maxLength !== undefined && data.length > (schema.maxLength as number)) {
      violations.push({
        path: currentPath, rule: 'maxLength',
        expected: `长度 <= ${schema.maxLength}`, actual: data,
        suggestion: `不超过 ${schema.maxLength} 个字符`,
      })
    }
  }

  return violations
}

/**
 * 将校验报告格式化为 LLM 可理解的自然语言反馈
 */
export function formatReportForLLM(report: ValidationReport): string {
  const dir = report.direction === 'input' ? '输入参数' : '输出结果'
  const lines = [
    `${report.skillName} 的${dir}校验失败（第 ${report.attempt}/${report.maxAttempts} 次尝试）：`,
    '',
  ]

  for (const v of report.violations) {
    lines.push(`• [${v.path}] ${v.rule}: 期望 ${v.expected}，实际为 ${JSON.stringify(v.actual)}`)
    lines.push(`  修复建议: ${v.suggestion}`)
  }

  lines.push('', '请根据以上信息修正后重新输出。')
  return lines.join('\n')
}

/**
 * 从 LLM 输出中提取 JSON（处理 markdown code block 等情况）
 */
export function extractJSON(text: string): Record<string, unknown> {
  // 直接解析
  try { return JSON.parse(text) } catch { /* continue */ }

  // 提取 ```json ... ``` 块
  const jsonBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlock) {
    return JSON.parse(jsonBlock[1].trim())
  }

  // 提取第一个 { ... } 块
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1))
  }

  throw new Error('No valid JSON found in LLM output')
}

// ═══════════════════════════════════════════════════════════════
// Pipeline 接口校验 — 检查上游 output 是否满足下游 input
// ═══════════════════════════════════════════════════════════════

export interface InterfaceMismatch {
  field: string
  issue: 'missing' | 'type_mismatch'
  expected: string
  actual?: string
  /** 上游 output 中语义最接近的候选字段（用于自动映射） */
  candidate?: string
}

/**
 * 校验上游 Skill 的 output schema 是否能满足下游 Skill 的 input schema
 * 返回不兼容字段列表（空数组 = 完全兼容）
 */
export function validatePipelineInterface(
  upstreamOutput: JSONSchema,
  downstreamInput: JSONSchema,
): InterfaceMismatch[] {
  const mismatches: InterfaceMismatch[] = []

  const outProps = (upstreamOutput?.properties ?? {}) as Record<string, JSONSchema>
  const inProps = (downstreamInput?.properties ?? {}) as Record<string, JSONSchema>
  const inRequired = (downstreamInput?.required ?? []) as string[]

  // 只检查下游 required 字段（可选字段缺失不影响执行）
  for (const field of inRequired) {
    const inProp = inProps[field]
    if (!inProp) continue

    // 跳过 $resolve 注入的字段
    if (inProp.$resolve) continue

    if (field in outProps) {
      // 字段名匹配 — 检查类型
      const outType = outProps[field]?.type as string | undefined
      const inType = inProp.type as string | undefined
      if (outType && inType && outType !== inType) {
        mismatches.push({
          field,
          issue: 'type_mismatch',
          expected: inType,
          actual: outType,
        })
      }
    } else {
      // 字段名缺失 — 尝试从上游找语义最接近的候选
      const candidate = findSemanticCandidate(field, inProp, outProps)
      mismatches.push({
        field,
        issue: 'missing',
        expected: (inProp.type as string) || 'unknown',
        candidate: candidate || undefined,
      })
    }
  }

  return mismatches
}

/**
 * 根据字段描述的语义相似度，在上游 output 中找最佳候选字段
 * 用于自动推断字段映射（如 description → condition）
 */
function findSemanticCandidate(
  targetField: string,
  targetProp: JSONSchema,
  candidateProps: Record<string, JSONSchema>,
): string | null {
  const targetType = targetProp.type as string
  const targetDesc = ((targetProp.description as string) || '').toLowerCase()

  let bestCandidate: string | null = null
  let bestScore = 0

  for (const [name, prop] of Object.entries(candidateProps)) {
    // 类型必须匹配
    if (prop.type && prop.type !== targetType) continue

    const desc = ((prop.description as string) || '').toLowerCase()
    let score = 0

    // 描述关键词重叠
    const targetWords = new Set(targetDesc.split(/\s+/).filter(w => w.length > 1))
    const candidateWords = desc.split(/\s+/).filter(w => w.length > 1)
    for (const w of candidateWords) {
      if (targetWords.has(w)) score += 2
    }

    // 字段名子串匹配
    if (name.includes(targetField) || targetField.includes(name)) score += 3

    if (score > bestScore) {
      bestScore = score
      bestCandidate = name
    }
  }

  return bestScore >= 2 ? bestCandidate : null
}

/**
 * 根据接口校验结果，生成字段映射表
 * 返回 { downstreamField → upstreamField } 映射
 */
export function buildFieldMapping(mismatches: InterfaceMismatch[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const m of mismatches) {
    if (m.issue === 'missing' && m.candidate) {
      mapping[m.field] = m.candidate
    }
  }
  return mapping
}

/**
 * 应用字段映射：把上游 output 数据的字段名映射为下游 input 期望的字段名
 */
export function applyFieldMapping(
  data: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const result = { ...data }
  for (const [targetField, sourceField] of Object.entries(mapping)) {
    if (sourceField in result && !(targetField in result)) {
      result[targetField] = result[sourceField]
    }
  }
  return result
}

/**
 * Pipeline 深度字段提取 — 从上游输出中智能提取下游需要的字段
 *
 * 当上游输出的结构与下游输入 schema 不直接匹配时：
 * 1. 直接字段名匹配（顶层）
 * 2. 数组首元素提取（array → primitive）
 * 3. 嵌套对象字段提取（array[0].field → field）
 * 4. 语义子串匹配（code → stock_code）
 *
 * 不硬编码任何字段名，通用适配所有 Skill 组合。
 */
export function resolvePipelineInput(
  upstreamOutput: Record<string, unknown>,
  downstreamInputSchema: JSONSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const inProps = (downstreamInputSchema.properties ?? {}) as Record<string, JSONSchema>

  for (const [fieldName, fieldSchema] of Object.entries(inProps)) {
    // 跳过 $resolve 注入的字段
    if (fieldSchema.$resolve) continue

    const expectedType = fieldSchema.type as string
    const enumValues = fieldSchema.enum as unknown[] | undefined

    // 1. 顶层直接匹配（带枚举约束检查）
    if (fieldName in upstreamOutput) {
      if (matchesConstraints(upstreamOutput[fieldName], expectedType, enumValues)) {
        result[fieldName] = upstreamOutput[fieldName]
        continue
      }
      // 值存在但不满足约束（如 enum 不匹配），不跳过，继续尝试其他提取方式
    }

    // 2. 深度提取：搜索嵌套结构（带枚举约束）
    const extracted = deepExtractField(upstreamOutput, fieldName, expectedType, enumValues)
    if (extracted !== undefined) {
      result[fieldName] = extracted
      continue
    }

    // 3. 语义匹配：在顶层字段中找语义相近的（带枚举约束）
    for (const outKey of Object.keys(upstreamOutput)) {
      if (isSubstringMatch(outKey, fieldName) && matchesConstraints(upstreamOutput[outKey], expectedType, enumValues)) {
        result[fieldName] = upstreamOutput[outKey]
        break
      }
    }
  }

  // 4. 复合值拆分 — 从已提取的字段值中派生缺失的枚举字段
  //    例如 stock_code="000001.SH" 可拆分出 market_type="SH"
  splitCompositeValues(result, inProps)

  return result
}

/**
 * 深度搜索嵌套结构提取字段值
 */
function deepExtractField(
  data: Record<string, unknown>,
  targetField: string,
  targetType: string,
  enumValues?: unknown[],
): unknown {
  for (const [_key, value] of Object.entries(data)) {
    // 数组 → 取首元素，在其中搜索
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0]

      // 数组元素是对象 → 在对象属性中搜索
      if (typeof first === 'object' && first !== null) {
        const obj = first as Record<string, unknown>
        // 精确字段名匹配（带约束检查）
        if (targetField in obj && matchesConstraints(obj[targetField], targetType, enumValues)) {
          return obj[targetField]
        }
        // 子串匹配（如 obj.code → targetField stock_code，带约束检查）
        for (const [subKey, subVal] of Object.entries(obj)) {
          if (isSubstringMatch(subKey, targetField) && matchesConstraints(subVal, targetType, enumValues)) {
            return subVal
          }
        }
      }

      // 数组元素是基本类型且目标也是基本类型 → 取首元素
      if (typeof first !== 'object' && matchesConstraints(first, targetType, enumValues)) {
        // 仅当数组键名与目标字段语义相关时才提取
        if (isSubstringMatch(_key, targetField)) {
          return first
        }
      }
    }

    // 嵌套对象 → 递归搜索
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = deepExtractField(value as Record<string, unknown>, targetField, targetType, enumValues)
      if (nested !== undefined) return nested
    }
  }

  return undefined
}

/**
 * 子串匹配：检查两个字段名是否有有意义的子串重叠
 * 例如 "code" ↔ "stock_code"，"name" ↔ "stock_name"
 */
function isSubstringMatch(a: string, b: string): boolean {
  const al = a.toLowerCase()
  const bl = b.toLowerCase()

  // 直接包含
  if (al.includes(bl) || bl.includes(al)) return true

  // 分词后匹配（stock_code → [stock, code]）
  const aParts = al.split(/[_\-.]/)
  const bParts = bl.split(/[_\-.]/)

  for (const ap of aParts) {
    if (ap.length < 3) continue // 跳过太短的词（如 id）
    for (const bp of bParts) {
      if (bp.length < 3) continue
      if (ap === bp) return true
    }
  }

  return false
}

function matchesType(value: unknown, expectedType: string): boolean {
  if (!expectedType) return true
  const actual = getJSONType(value)
  return actual === expectedType
}

/**
 * 综合约束检查：类型 + 枚举
 */
function matchesConstraints(value: unknown, expectedType: string, enumValues?: unknown[]): boolean {
  if (!matchesType(value, expectedType)) return false
  if (enumValues && enumValues.length > 0 && !enumValues.includes(value)) return false
  return true
}

/**
 * 复合值拆分 — 从已有字段值中派生缺失的枚举字段
 *
 * 场景: stock_code="000001.SH" 且 market_type 有 enum ["SH","SZ"]
 * → 拆分: stock_code="000001", market_type="SH"
 *
 * 通用逻辑：在任意已填字符串值中搜索分隔符（. - _ /），
 * 检查后缀是否匹配某个未填字段的枚举值。
 */
function splitCompositeValues(
  result: Record<string, unknown>,
  inProps: Record<string, JSONSchema>,
): void {
  // 收集缺失的、有枚举约束的字段
  const missingEnumFields: Array<{ name: string; values: string[] }> = []
  for (const [name, schema] of Object.entries(inProps)) {
    if (name in result) continue
    if (schema.$resolve) continue
    const ev = schema.enum as string[] | undefined
    if (ev && ev.length > 0 && ev.every(v => typeof v === 'string')) {
      missingEnumFields.push({ name, values: ev })
    }
  }

  if (missingEnumFields.length === 0) return

  // 遍历已有的字符串值，尝试拆分
  for (const [existingField, existingVal] of Object.entries(result)) {
    if (typeof existingVal !== 'string') continue

    for (const { name: enumField, values: enumValues } of missingEnumFields) {
      if (enumField in result) continue // 已被之前的拆分填充

      // 尝试各种分隔符
      for (const sep of ['.', '-', '_', '/']) {
        const sepIdx = existingVal.lastIndexOf(sep)
        if (sepIdx === -1 || sepIdx === 0 || sepIdx === existingVal.length - 1) continue

        const suffix = existingVal.slice(sepIdx + 1)
        if (enumValues.includes(suffix)) {
          result[enumField] = suffix
          result[existingField] = existingVal.slice(0, sepIdx)
          break
        }
      }
    }
  }
}

function getJSONType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'function') return 'function'
  return typeof value
}
