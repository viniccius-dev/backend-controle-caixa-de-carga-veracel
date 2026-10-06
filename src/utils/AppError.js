class AppError {
    constructor(message, statusCode = 400, extras = {}) {
        this.message = message;
        this.statusCode = statusCode;
        this.extras = extras;
    }
}

module.exports = AppError;
