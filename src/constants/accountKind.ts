import { Member, PrismaClient } from '@prisma/client'

export interface ComputeKind {
  computeKind(arg0: Member): { kind: 'USER' | 'GHOST' }
}

function withComputeKind(prisma: PrismaClient): PrismaClient & ComputeKind {
  const computeKind: ComputeKind = {
    /**
     * Signup the first user and create a new team of one. Return the User with
     * a full name and without a password
     */
    computeKind(
      member
    ) {
      return {
        ...member,
        kind: (Number.parseInt(member.account).toString() !== member.account) ? 'GHOST' : 'USER',
      }
    },
  }
  return Object.assign(prisma, computeKind)
}

export default withComputeKind
