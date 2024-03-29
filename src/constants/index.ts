export const howEval = `*bold \*Поддерживаемые математические символы*\n
\+ Оператор сложения например 2\+3 результат 5\n
\- Оператор вычитания например 2\-3 результат \-1\n
\/ Оператор деления например 3\/2 результат 1,5\n
\* Оператор умножения например 2\*3 результат 6\n
\( Открывающаяся скобка\n
\) Закрывающаяся скобка\n
Если выражение может быть прочитано человеком, то оно будет прочитано и этим калькулятором. Нет необходимости заключать каждое выражение в круглые скобки. Например. 5\*3\/2 будет отлично работать вместо \(5\*3\)\/2`

export const numericSymbolicFilter = /^[0-9+()\-*\/.]+$/
export const numericFilter = /^[0-9]+$/
export const usernameFilter = /^@[0-9a-zA-Z_]{5,}$/
export const alphabeticalFilter = /^[0-9a-zA-Zа-яА-Я_.]{3,}$/

export const escapeChars = (text: string) => {
  return text.replace(/([+=()\-*\/_.])/g, match => '\\' + match)
}

export const escapeCharsExceptLink = (text: string) => {
  return text.replace(/([+=\-*\/_.])/g, match => '\\' + match)
}

export const hasCommands = /(?:.*((\/rename)|(\/include)|(\/pay)|(\/order)|(\/buy)|(\/give))+.*)/