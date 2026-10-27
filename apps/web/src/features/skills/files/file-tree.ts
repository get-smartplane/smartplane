import type { SkillFile } from "@pc/domain"

export interface FileNode {
  readonly kind: "file"
  readonly name: string
  readonly file: SkillFile
}

export interface FolderNode {
  readonly kind: "folder"
  readonly name: string
  readonly path: string
  readonly children: ReadonlyArray<TreeNode>
}

export type TreeNode = FileNode | FolderNode

interface MutableFolder {
  readonly folders: Map<string, MutableFolder>
  readonly files: Array<SkillFile>
}

const emptyFolder = (): MutableFolder => ({ folders: new Map(), files: [] })

/** SKILL.md leads, then folders, then files, each alphabetically: the order people read a skill in. */
const rank = (node: TreeNode): number => (node.kind === "file" && node.name === "SKILL.md" ? 0 : node.kind === "folder" ? 1 : 2)

const toNodes = (folder: MutableFolder, prefix: string): ReadonlyArray<TreeNode> =>
  [
    ...[...folder.folders].map(([name, child]): TreeNode => ({ kind: "folder", name, path: `${prefix}${name}`, children: toNodes(child, `${prefix}${name}/`) })),
    ...folder.files.map((file): TreeNode => ({ kind: "file", name: file.path.slice(prefix.length), file }))
  ].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))

/** Turns a version's flat manifest into nested folders. */
export const buildTree = (files: ReadonlyArray<SkillFile>): ReadonlyArray<TreeNode> => {
  const root = emptyFolder()
  for (const file of files) {
    const segments = file.path.split("/").slice(0, -1)
    const folder = segments.reduce((parent, segment) => {
      const existing = parent.folders.get(segment)
      if (existing !== undefined) return existing
      const created = emptyFolder()
      parent.folders.set(segment, created)
      return created
    }, root)
    folder.files.push(file)
  }
  return toNodes(root, "")
}

export const totalSize = (files: ReadonlyArray<SkillFile>): number => files.reduce((sum, file) => sum + file.size, 0)
