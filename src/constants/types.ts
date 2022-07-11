import type { NarrowedContext, Context, Types } from 'telegraf'
import type { MemberWithKind } from './accountKind'

export type MemberWithUsername = MemberWithKind & { username: string | undefined, name: string }

export class MemberWithLink implements MemberWithUsername {
  chatId: bigint
  account: string
  active: boolean
  getKind: () => 'USER' | 'GHOST'
  username: string | undefined
  name: string
  
  constructor(member: MemberWithUsername) {
    this.chatId = member.chatId
    this.account = member.account
    this.active = member.active
    this.getKind = member.getKind
    this.name = member.name
    this.username = member.username
  }
  displayName = ():string => {
    return this.username ? '@' + this.username : this.name
  }
  linkName = ():string => {
    const userLink = `[${this.name}](tg://user?id=${this.account})`
    return `${this.username ? '@' + this.username : this.getKind() === 'USER' ? userLink : this.account}`
  }
}

export type SpecificContext = Pick<NarrowedContext<Context, Types.MountMap['text']>, 'chat' | 'prisma' | 'cache' | 'telegram'> & {
  message: Pick<NarrowedContext<Context, Types.MountMap['text']>['message'], 'message_id' | 'text' | 'from' | 'entities'>
}

export type PrismaChatContext = Pick<NarrowedContext<Context, Types.MountMap['callback_query']>, 'chat' | 'prisma' | 'cache' | 'telegram'>