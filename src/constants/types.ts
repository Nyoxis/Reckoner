import type { NarrowedContext, Context, Types } from 'telegraf'
import { escapeChars } from '.'
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
    return `${this.username ? '@' + escapeChars(this.username) : this.getKind() === 'USER' ? userLink : escapeChars(this.account)}`
  }
  linkNameUnescaped = ():string => {
    const userLink = `[${this.name}](tg://user?id=${this.account})`
    return `${this.username ? '@' + this.username : this.getKind() === 'USER' ? userLink : this.account}`
  }
}

export type MemberWithSum = MemberWithLink & {
  totalSum: number,
  unfrozenSum: number,
}

export type RecordWithRecipients = {
  id: bigint
  active: boolean
  recipients: {
      account: string
  }[]
  messageId: bigint
  replyId: bigint | null
  chatId: bigint
  donorAccount: string | null
  hasDonor: boolean
  recipientsQuantity: number
  amount: number
}

export type RecordWithFullRecipients = {
  id: bigint
  active: boolean
  recipients: ({
      account: string
  } | MemberWithLink)[]
  messageId: bigint
  replyId: bigint | null
  chatId: bigint
  donorAccount: string | null
  donor: MemberWithLink | undefined
  hasDonor: boolean
  recipientsQuantity: number
  amount: number
}

export class RecordWithType implements RecordWithRecipients {
  id: bigint
  active: boolean
  recipients: ({
      account: string
  } | MemberWithLink)[]
  messageId: bigint
  replyId: bigint | null
  chatId: bigint
  donorAccount: string | null
  donor: undefined | MemberWithLink
  hasDonor: boolean
  recipientsQuantity: number
  amount: number
  
  constructor(record: RecordWithFullRecipients) {
    this.id = record.id
    this.active = record.active
    this.recipients = record.recipients
    this.messageId = record.messageId
    this.replyId = record.replyId
    this.chatId = record.chatId
    this.donorAccount = record.donorAccount
    this.donor = record.donor
    this.hasDonor = record.hasDonor
    this.recipientsQuantity = record.recipientsQuantity
    this.amount = record.amount
  }
  getType = ():'order' |'pay' | 'buy' | 'give' => {
    if (!this.hasDonor) return 'order'
    else if (!this.recipientsQuantity) return 'pay'
    else if (this.recipients.some(recipient => recipient.account === this.donorAccount)) return 'buy'
    else return 'give'
  }
}

export type SpecificContext = Pick<NarrowedContext<Context, Types.MountMap['text']>, 'chat' | 'prisma' | 'cache' | 'telegram'> & {
  message: Pick<NarrowedContext<Context, Types.MountMap['text']>['message'], 'message_id' | 'text' | 'from' | 'entities'>
}

export type PrismaChatContext = Pick<NarrowedContext<Context, Types.MountMap['callback_query']>, 'chat' | 'prisma' | 'cache' | 'telegram'>