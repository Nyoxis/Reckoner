import { numericSymbolicFilter } from '../constants'
import { evaluate } from '../constants/functions'

import type { MiddlewareFn, NarrowedContext, Context, Types } from "telegraf"
import type { InlineQueryResultArticle } from 'telegraf/typings/core/types/typegram'

const rectifyCommand: MiddlewareFn<NarrowedContext<Context, Types.MountMap['inline_query']>> = (ctx, next) => {
  const query = ctx.inlineQuery.query

  const hasCommands = /(?:.*((\/include)|(\/pay)|(\/order)|(\/buy)|(\/give))+.*)/
  if (!hasCommands.test(query)) return ctx.answerInlineQuery([])
  
  const parameters = query.split(' ')
  let numeric: string | undefined = ''
  numeric = parameters.find(parameter => numericSymbolicFilter.test(parameter))
  if (!numeric) return ctx.answerInlineQuery([])
  
  const text = query.replace(numeric, numeric.replace(/([+()\-*\/])/g, match => '\\' + match))
  let sum: number
  try {
    sum = Math.trunc(evaluate(numeric) * 100)/100
  } catch (err) {
    if (typeof err === 'string') {
      return ctx.answerInlineQuery([])
    } else throw err
  }
  
  const result: InlineQueryResultArticle = {
    type: 'article',
    id: sum.toString(),
    title: `Выполнить операцию на сумму ${sum}`,
    input_message_content: { message_text: text, parse_mode: 'MarkdownV2' },
  }
  ctx.answerInlineQuery([result])
}

export { rectifyCommand }