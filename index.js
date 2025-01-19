const axios = require("axios");
const { Bot, InputFile, InlineKeyboard } = require("grammy");
const { URLSearchParams } = require('url');
const puppeteer = require('puppeteer');
const { hydrateReply } = require("@grammyjs/parse-mode");
const sqlite3 = require('sqlite3').verbose();

const bot = new Bot("7531458935:AAFPWT5uj9NQ2eFJS9uxU3Ht6SVedeiCBbI");
bot.use(hydrateReply);

// Подключаем и создаем базу данных, если она не существует
const db = new sqlite3.Database('userstg.db', (err) => {
    if (err) {
        console.error("Ошибка при подключении к базе данных:", err);
    } else {
        console.log("База данных подключена");
        // Создаем таблицу users, если она не существует
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id INTEGER UNIQUE,
            nickname TEXT
        )`);
    }
});

let gameData = {};

// ID администратора
const adminTgId = 686963601; // Ваш настоящий Telegram ID

// Функция для получения всех пользователей из базы данных
async function getAllUsersFromDb() {
    return new Promise((resolve, reject) => {
        db.all("SELECT tg_id, nickname FROM users", [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Функция для отправки списка пользователей
async function sendUsersList(ctx) {
    const users = await getAllUsersFromDb();
    if (users.length === 0) {
        await ctx.reply("В базе данных нет пользователей.");
    } else {
        let usersList = "Список пользователей:\n";
        users.forEach((user, index) => {
            usersList += `${index + 1}. ${user.nickname} (ID: ${user.tg_id})\n`;
        });
        await ctx.reply(usersList);
    }
}

async function htmlToImage(htmlContent) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent);
    const imageBuffer = await page.screenshot({ type: 'png' });
    await browser.close();
    return imageBuffer;
}

async function generateSchedule(ctx) {
    const formData = new URLSearchParams();
    const currentDate = new Date();
    formData.append('dt1', currentDate.toISOString().slice(0, 10));
    const futureDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    formData.append('dt2', futureDate.toISOString().slice(0, 10));
    formData.append('gruppa', '354д');
    
    try {
        const response = await axios.post('https://ntgmk.ru/program/rasp3.php', formData);
        const htmlCode = response.data;

        // Конвертация HTML в изображение
        const imageBuffer = await htmlToImage(htmlCode);

        // Отправка изображения с кнопкой "Снова"
        const inputFile = new InputFile(imageBuffer, 'schedule.png');
        await ctx.replyWithPhoto(inputFile, {
            caption: "Вот ваше расписание на следующую неделю:",
            reply_markup: new InlineKeyboard()
                .text('Назад', 'back')
                .text('Снова', 'generate_schedule')
        });
    } catch (error) {
        console.error("Ошибка:", error);
        await ctx.reply('Произошла ошибка при получении расписания.');
    }
}

async function startGame(ctx) {
    const targetNumber = Math.floor(Math.random() * 10) + 1; // Загадываем число от 1 до 10
    gameData[ctx.chat.id] = targetNumber; // Сохраняем число для пользователя

    await ctx.reply(
        "Я загадал число от 1 до 10. Попробуй угадать его! Введи свое число:",
        {
            reply_markup: {
                remove_keyboard: true,
            }
        }
    );
}

async function checkGuess(ctx, guess) {
    const targetNumber = gameData[ctx.chat.id];

    if (guess === targetNumber) {
        await ctx.reply("Поздравляю! Ты угадал число!");
    } else {
        await ctx.reply("Неправильно. Ты долбаеб!");
    }

    // После окончания игры предлагаем начать заново
    await ctx.reply(
        "Хотите сыграть ещё раз?",
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "Ещё раз", callback_data: "games" }
                    ],
                    [
                        { text: "Назад", callback_data: "back" }
                    ]
                ],
            }
        }
    );

    delete gameData[ctx.chat.id]; // Очищаем данные игры
}

// Функция для добавления нового пользователя в базу данных
async function addUserToDb(tg_id, nickname) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR IGNORE INTO users (tg_id, nickname) VALUES (?, ?)`,
            [tg_id, nickname],
            (err) => {
                if (err) {
                    console.error("Ошибка при добавлении пользователя:", err);
                    reject(err);
                } else {
                    console.log(`Пользователь ${nickname} добавлен в базу данных`);
                    resolve();
                }
            }
        );
    });
}

bot.command("start", async (ctx) => {
    const tg_id = ctx.from.id;
    const nickname = ctx.from.username;

    // Добавляем пользователя в базу данных
    await addUserToDb(tg_id, nickname);

    let inlineKeyboard = [
        [
            { text: "Расписание", callback_data: "schedule" }
        ],
        [
            { text: "Помощь", callback_data: "help" }
        ],
        [
            { text: "Игры", callback_data: "games" }
        ],
        [
            { text: "Донат", callback_data: "donate" }
        ]
    ];

    // Добавляем кнопку "Пользователи" для администратора
    if (tg_id === adminTgId) {
        inlineKeyboard.push(
            [{ text: "Пользователи", callback_data: "users" }]
        );
    }

    await ctx.replyWithPhoto(
        "http://post-images.org/photo-page.php?photo=hjNyUvEm",
        {
            caption: "<b>Привет👋</b>\n\n" +
                     "Я - телеграм бот, который поможет тебе с получением расписания и множеством других функций!\n\n" +
                     "Выбери команду, чтобы начать работу с ботом:",
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: inlineKeyboard,
            },
        }
    );
});

// Коллбэк для кнопки "Пользователи"
bot.on("callback_query:data", async (ctx) => {
    const action = ctx.callbackQuery.data;

    if (action === "schedule") {
        await generateSchedule(ctx);
    } else if (action === "help") {
        await ctx.reply(
            "Если у вас возникли вопросы или проблемы с ботом,\nпишите <b>@mikishlep</b>", 
            {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "Назад", callback_data: "back" },
                        ],
                    ],
                },
            }
        );
    } else if (action === "back") {
        await ctx.replyWithPhoto(
            "http://post-images.org/photo-page.php?photo=hjNyUvEm",
            {
                caption: "<b>Привет👋</b>\n\n" +
                         "Я - телеграм бот, который поможет тебе с получением расписания и множеством других функций!\n\n" +
                         "Выбери команду, чтобы начать работу с ботом:",
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "Расписание", callback_data: "schedule" }
                        ],
                        [
                            { text: "Помощь", callback_data: "help" }
                        ],
                        [
                            { text: "Игры", callback_data: "games" }
                        ],
                        [
                            { text: "Пользователи", callback_data: "users" }
                        ],
                        [
                            { text: "Донат", callback_data: "donate" }
                        ]
                    ],
                },
            }
        );
    } else if (action === "generate_schedule") {
        await generateSchedule(ctx);
    } else if (action === "games") {
        await startGame(ctx);
    } else if (action === "users" && ctx.from.id === adminTgId) {
        // Отправляем список пользователей, если администратор нажал кнопку "Пользователи"
        await sendUsersList(ctx);
    } else if (action === "donate") {
        await ctx.reply(
            `<b>Реквизиты для перевода</b>\n\n<b>Банк:</b> Тбанк\n<b>Номер телефона:</b> +79122141285`, 
            { 
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "Назад", callback_data: "back" },
                        ],
                    ],
                },
            }
        );
    }       
});

bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    // Если пользователь еще не начал игру
    if (gameData[ctx.chat.id]) {
        const guess = parseInt(text, 10);
        if (!isNaN(guess)) {
            await checkGuess(ctx, guess); // Проверка числа
        } else {
            await ctx.reply("Пожалуйста, введите число от 1 до 10.");
        }
    }
});

bot.command("schedule", async (ctx) => {
    await generateSchedule(ctx);
});

bot.start();