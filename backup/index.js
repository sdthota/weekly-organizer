const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');

// Configure DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = 'MealPlanner';

    
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const userId = handlerInput.requestEnvelope.context.System.user.userId;
        const meals = await getUserMeals(userId);

        const speakOutput = 'Welcome to your Weekly Meal Planner. You can say things like "Edit Monday breakfast to pancakes".';
        const aplSupported = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)['Alexa.Presentation.APL'];

        if (aplSupported) {
            handlerInput.responseBuilder.addDirective({
                type: 'Alexa.Presentation.APL.RenderDocument',
                version: '1.0',
                document: require('./meal-planner-apl.json'),
                datasources: {
                    mealData: {
                        type: 'object',
                        meals: meals || []
                    }
                }
            });
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('What would you like to do?')
            .getResponse();
    }
};

const EditMealIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'EditMealIntent';
    },
    async handle(handlerInput) {
        const slots = handlerInput.requestEnvelope.request.intent.slots;
        const day = slots.day.value;
        const mealType = slots.mealType.value;
        const mealName = slots.mealName.value;
        const userId = handlerInput.requestEnvelope.context.System.user.userId;

        if (!day || !mealType || !mealName) {
            return handlerInput.responseBuilder
                .speak("Please specify a day, a meal type, and the name of the meal.")
                .reprompt("Try saying, edit Monday breakfast to pancakes.")
                .getResponse();
        }

        // Save to DynamoDB
        await updateMeal(userId, day, mealType, mealName);

        const speakOutput = `Updated ${day} ${mealType} to now be made a ${mealName}. Can I help you with anything else?`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Would you like to update another meal?')
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('You can say edit Monday breakfast to pancakes, or say what meals are planned for today.')
            .reprompt('How can I help?')
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('Goodbye!')
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak("Sorry, I didn’t understand that. Please try again.")
            .reprompt("Try saying, edit Monday lunch to pizza.")
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder.getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.error(error);
        return handlerInput.responseBuilder
            .speak('Sorry, I had trouble doing what you asked. Please try again.')
            .reprompt('Can you repeat that?')
            .getResponse();
    }
};

// DynamoDB helper functions
async function updateMeal(userId, day, mealType, mealName) {
    const key = `${day.toLowerCase()}_${mealType.toLowerCase()}`;

    // First, fetch existing meals
    const paramsGet = {
        TableName: TABLE_NAME,
        Key: { userId }
    };

    let meals = {};
    try {
        const result = await dynamoDB.get(paramsGet).promise();
        meals = result.Item?.meals || {};
    } catch (err) {
        console.error("Error fetching meals for update:", err);
    }

    // Update in memory
    meals[key] = mealName;

    // Then, overwrite the `meals` map
    const paramsUpdate = {
        TableName: TABLE_NAME,
        Key: { userId },
        UpdateExpression: `SET meals = :meals`,
        ExpressionAttributeValues: {
            ':meals': meals
        }
    };

    await dynamoDB.update(paramsUpdate).promise();
}
const GetAllMealsIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetAllMealsIntent';
    },
    async handle(handlerInput) {
        const userId = handlerInput.requestEnvelope.context.System.user.userId;
        const meals = await getUserMeals(userId);

        if (meals.length === 0) {
            return handlerInput.responseBuilder
                .speak("You don't have any meals saved yet. You can say, edit Monday breakfast to pancakes.")
                .reprompt("Try saying, edit Monday lunch to pizza.")
                .getResponse();
        }

        // Group and format meals by day
        const grouped = meals.reduce((acc, { day, mealType, mealName }) => {
            if (!acc[day]) acc[day] = {};
            acc[day][mealType] = mealName;
            return acc;
        }, {});

        let speakOutput = 'Here is your meal plan: ';
        for (const day of Object.keys(grouped).sort()) {
            speakOutput += `${day}: `;
            const mealsByDay = grouped[day];
            for (const type of Object.keys(mealsByDay)) {
                speakOutput += `${type} is ${mealsByDay[type]}, `;
            }
        }

        return handlerInput.responseBuilder
            .speak(speakOutput.trim())
            .reprompt('Would you like to change any meals?')
            .getResponse();
    }
};



async function getUserMeals(userId) {
    const params = {
        TableName: TABLE_NAME,
        Key: { userId }
    };
    try {
        const result = await dynamoDB.get(params).promise();
        const mealsObj = result.Item?.meals || {};
        return Object.entries(mealsObj).map(([key, value]) => {
            const [day, mealType] = key.split('_');
            return { day, mealType, mealName: value };
        });
    } catch (error) {
        console.error('Error fetching meals:', error);
        return [];
    }
}
const LoggingRequestInterceptor = {
    process(handlerInput) {
        console.log('REQUEST ENVELOPE = ', JSON.stringify(handlerInput.requestEnvelope, null, 2));
    }
};

const LoggingResponseInterceptor = {
    process(handlerInput, response) {
        console.log('RESPONSE = ', JSON.stringify(response, null, 2));
    }
};
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        EditMealIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        GetAllMealsIntentHandler
    )
    .addRequestInterceptors(LoggingRequestInterceptor)
    .addResponseInterceptors(LoggingResponseInterceptor)
    .addErrorHandlers(ErrorHandler)
    .lambda();
