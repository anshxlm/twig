import chalk from 'chalk';

export class Logger {

success(source, message){console.log(chalk.hex('#00bf39')((`${source} - success: ${chalk.whiteBright(message)}`)))}
log(source, message){console.log(chalk.hex('#a3a3a3')(`${source} - log: ${chalk.whiteBright(message)}`))}
warning(source, message){console.log(chalk.hex('#e09d00')(`${source} - warning: ${chalk.whiteBright(message)}`))}
error(source, message){console.log(chalk.hex('#c60000')(`${source} - error: ${chalk.whiteBright(message)}`))}

returnSuccess(source, message){return (chalk.hex('#00bf39')((`${source} - success: ${chalk.whiteBright(message)}`)))}
returnLog(source, message){return (chalk.hex('#a3a3a3')(`${source} - log: ${chalk.whiteBright(message)}`))}
returnWarning(source, message){console.log(chalk.hex('#e09d00')(`${source} - warning: ${chalk.whiteBright(message)}`))}
returnError(source, message){return (chalk.hex('#c60000')(`${source} - error: ${chalk.whiteBright(message)}`))}

output(message){console.log(chalk.hex('#006ece')(`output: ${chalk.whiteBright(message)}`))}

}