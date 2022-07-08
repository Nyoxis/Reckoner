import { Member, PrismaClient } from '@prisma/client'

export class MemberWithKind implements Member {
  chatId: bigint
  account: string
  active: boolean
  
  constructor (member: Member) {
    this.account = member.account
    this.chatId = member.chatId
    this.active = member.active
  }
  
  getKind = (): 'USER' | 'GHOST' => {
    return /^[0-9]+$/.test(this.account) ? 'USER' : 'GHOST'
  }
}

type MemberOrMembers<T extends Member | Member[]> = T extends Member ? MemberWithKind : MemberWithKind[]
export interface ComputeKind {
  withKind<T extends Member | Member[]>(arg0: T): MemberOrMembers<T>
  withKind(arg0: Member | Member[]): MemberWithKind | MemberWithKind[]
}

function withComputeKind(prisma: PrismaClient): PrismaClient & ComputeKind {
  const computeKind: ComputeKind = {
    withKind(
      member: Member | MemberWithKind
    ) {
      const withKind = (element: Member): MemberWithKind => new MemberWithKind(element)
      if (Array.isArray(member)) {
        return member.map(withKind)
      } else return withKind(member)
    },
  }
  return Object.assign(prisma, computeKind)
}

export default withComputeKind
