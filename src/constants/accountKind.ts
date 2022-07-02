import { Member, PrismaClient } from '@prisma/client'

export type MemberWithKind = Member & { kind: 'USER' | 'GHOST' }
export type MemberWithUsername = MemberWithKind & { username?: string }
type MemberOrMembers<T extends Member | Member[]> = T extends Member ? MemberWithKind : MemberWithKind[]
export interface ComputeKind {
  computeKind<T extends Member | Member[]>(arg0: T): MemberOrMembers<T>
  computeKind(arg0: Member | Member[]): MemberWithKind | MemberWithKind[]
}

function withComputeKind(prisma: PrismaClient): PrismaClient & ComputeKind {
  const computeKind: ComputeKind = {
    computeKind(
      member: Member | MemberWithKind
    ) {
      const getKind = (element: Member): MemberWithKind => ({
        ...element,
        kind: /^[0-9]+$/.test(element.account) ? 'USER' : 'GHOST',
      })
      if (Array.isArray(member)) {
        return member.map(getKind)
      } else return getKind(member)
    },
  }
  return Object.assign(prisma, computeKind)
}

export default withComputeKind
