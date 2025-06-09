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
        const { structured, flatList } = await getUserMeals(userId);

        const speakOutput = 'Welcome to your Weekly Organizer. You can say things like "Edit Monday breakfast to pancakes" or "Add Archery to Monday activity"';
        const aplSupported = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)['Alexa.Presentation.APL'];

        if (aplSupported) {
            console.log("APL supported device render attempt", structured);
            handlerInput.responseBuilder.addDirective({
                type: 'Alexa.Presentation.APL.RenderDocument',
                version: '1.0',
                document: require('./meal-planner-apl.json'),
                datasources: {
                    mealData: {
                        type: 'object',
                        properties: structured  // For APL like mealData.breakfast.monday
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
        const request = Alexa.getRequestType(handlerInput.requestEnvelope);

        return (request === 'IntentRequest' && Alexa.getIntentName(handlerInput.requestEnvelope) === 'EditMealIntent');
    },

    async handle(handlerInput) {
        const request = handlerInput.requestEnvelope;
        const userId = request.context.System.user.userId;

        let day, mealType, mealName;

        // Voice-based intent
        day = Alexa.getSlotValue(request, 'day');
        mealType = Alexa.getSlotValue(request, 'mealType');
        mealName = Alexa.getSlotValue(request, 'mealName');
        
        console.log("slot values:",day, mealType, mealName);

        if (!day || !mealType || !mealName) {
            return handlerInput.responseBuilder
                .speak("Sorry, I couldn't understand the full meal details. Please try again.")
                .reprompt("What meal would you like to update?")
                .getResponse();
        }

        const optional_table_create_params = {
            TableName: TABLE_NAME,
            Key: { userId },
            UpdateExpression: 'SET meals = if_not_exists(meals, :empty)',
            ExpressionAttributeValues: {
                ':empty': { M: {} }
            }
        };
        const key = `${day.toLowerCase()}_${mealType.toLowerCase()}`;
        const params = {
            TableName: TABLE_NAME,
            Key: { userId },
            UpdateExpression: 'SET meals.#key = :value',
            ExpressionAttributeNames: {
                '#key': key
            },
            ExpressionAttributeValues: {
                ':value': { S: mealName }
            }
        };

        try {
            console.log("key:",key);
            console.log("DB create params",optional_table_create_params);
            console.log("DB update params",params);

            await dynamoDB.update(optional_table_create_params).promise();
            console.log("DB create success");
            await dynamoDB.update(params).promise();
            console.log("DB update success");
            const speakOutput = `Updated ${mealType} on ${day} to ${mealName}.`;

            const { flatList, structured } = await getUserMeals(userId);

            const aplSupported = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)['Alexa.Presentation.APL'];
            if (aplSupported) {
                console.log("APL supported device render attempt", structured);
                handlerInput.responseBuilder.addDirective({
                    type: 'Alexa.Presentation.APL.RenderDocument',
                    version: '1.0',
                    document: require('./meal-planner-apl.json'),
                    datasources: {
                        mealData: {
                            type: 'object',
                            properties: structured  // For APL like mealData.breakfast.monday
                        }
                    }
                });
            }
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt("Would you like to edit another meal?")
                .getResponse();
        } catch (err) {
            console.error('Error saving meal:', err);
            return handlerInput.responseBuilder
                .speak("Something went wrong while saving your meal. Please try again.")
                .getResponse();
        }
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
const SaveMealsFromAPLIntentHandler = {
    canHandle(handlerInput) {
      const request = handlerInput.requestEnvelope.request;
      return request.type === 'Alexa.Presentation.APL.UserEvent' &&
             request.arguments &&
             request.arguments[0] === 'save_meals';
    },
  
    async handle(handlerInput) {
      const userId = handlerInput.requestEnvelope.context.System.user.userId;
      const args = handlerInput.requestEnvelope.request.arguments.slice(1); // skip 'save_meals'
      try {
        console.log("input args", args);
        for (const entry of args) {
          const [key, mealName] = entry.split('=');
          if (!key || mealName === undefined) continue;
  
          const params = {
            TableName: TABLE_NAME,
            Key: { userId },
            UpdateExpression: 'SET meals.#key = :value',
            ExpressionAttributeNames: {
              '#key': key
            },
            ExpressionAttributeValues: {
              ':value': { S: mealName }
            }
          };
        console.log("Updating database",params);

        await dynamoDB.update(params).promise();

        const { flatList, structured } = await getUserMeals(userId);

        const aplSupported = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)['Alexa.Presentation.APL'];
        if (aplSupported) {
            console.log("APL supported device render attempt", structured);
            handlerInput.responseBuilder.addDirective({
                type: 'Alexa.Presentation.APL.RenderDocument',
                version: '1.0',
                document: require('./meal-planner-apl.json'),
                datasources: {
                    mealData: {
                        type: 'object',
                        properties: structured  // For APL like mealData.breakfast.monday
                        }
                    }
                });
            }
            
        }
  
        return handlerInput.responseBuilder
                .speak("Updated the weekly organizer with your input")
                .reprompt("Would you like to edit another activity or meal?")
                .getResponse();
      } catch (error) {
        console.error('Error saving meals:', error);
        return handlerInput.responseBuilder
          .speak('Sorry, there was a problem saving your meals.')
          .getResponse();
      }
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

const FreeSpeechIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'FreeSpeechIntent';
    },
    handle(handlerInput) {
      const querySlot = handlerInput.requestEnvelope.request.intent.slots.query;
      const spokenText = querySlot && querySlot.value ? querySlot.value : '';
  
      console.log('Freeform speech captured:', spokenText);
  
      const speakOutput = 'Welcome to your Weekly Organizer. You can say things like "Edit Monday breakfast to pancakes" or "Add Archery to Monday activity"';
  
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('What would you like to do next?')
        .getResponse();
    }
  };
  const CanFulfillIntentRequestHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'CanFulfillIntentRequest';
    },
    handle(handlerInput) {
      const intentName = handlerInput.requestEnvelope.request.intent.name;
      const slots = handlerInput.requestEnvelope.request.intent.slots;
  
      // Example: provide basic fulfillment info for known intents
      switch (intentName) {
        case 'GetAllMealsIntent':
        case 'EditMealIntent':
        case 'SaveMealsFromAPLIntentHandler':
        case 'FreeSpeechIntent':
          return handlerInput.responseBuilder
            .withCanFulfillIntent({
              canFulfill: 'YES',
              slots: Object.keys(slots || {}).reduce((acc, slotName) => {
                acc[slotName] = {
                  canUnderstand: 'YES',
                  canFulfill: 'YES'
                };
                return acc;
              }, {})
            })
            .getResponse();
  
        default:
          return handlerInput.responseBuilder
            .withCanFulfillIntent({
              canFulfill: 'NO'
            })
            .getResponse();
      }
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
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetAllMealsIntent';
    },
    async handle(handlerInput) {
        let day;
        const userId = handlerInput.requestEnvelope.context.System.user.userId;
        const request = handlerInput.requestEnvelope;

        day = Alexa.getSlotValue(request, 'dayinput');
        if(day){
            day = day.toLowerCase();
            day = resolveDayReference(day).toLowerCase();
            console.log("Day input", day);   
        }

        const { flatList, structured } = await getUserMeals(userId);

        let speakOutput = 'Here are your meals: <break time="500ms"/>';

        if (flatList.length === 0) {
            speakOutput = 'You don’t have any meals saved yet.';
        } else {
            console.log("Flat list", flatList);

            if(day){
                const filteredList = flatList
                .filter(item => item.day.toLowerCase() === day.toLowerCase())
                .map(item => escapeSSML(`${item.day} ${item.mealType}: ${item.mealName}`))
                .join('<break time="500ms"/>');;
                console.log("Day Filtered list", filteredList);
                speakOutput += filteredList
                
            }else{
                console.log("Full list", flatList);

                speakOutput += flatList
                .map(item => escapeSSML(`${item.day} ${item.mealType}: ${item.mealName}`))
                .join('<break time="500ms"/>');
            }
            
        }

        const aplSupported = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope)['Alexa.Presentation.APL'];
        if (aplSupported) {
            console.log("APL supported device render attempt", structured);
            handlerInput.responseBuilder.addDirective({
                type: 'Alexa.Presentation.APL.RenderDocument',
                version: '1.0',
                document: require('./meal-planner-apl.json'),
                datasources: {
                    mealData: {
                        type: 'object',
                        properties: structured  // For APL like mealData.breakfast.monday
                    }
                }
            });
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

function escapeSSML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  function resolveDayReference(slotValue) {
    const lower = slotValue.toLowerCase();
    const today = new Date();
    
    if (lower === 'today') {
        console.log("resolve day reference", today.toLocaleDateString('en-US', { weekday: 'long' }));
        return today.toLocaleDateString('en-US', { weekday: 'long' });
    }
    if (lower === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        console.log("resolve day reference",tomorrow.toLocaleDateString('en-US', { weekday: 'long' }));
        return tomorrow.toLocaleDateString('en-US', { weekday: 'long' });
    }
    if (lower === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        return yesterday.toLocaleDateString('en-US', { weekday: 'long' });
    }
    return slotValue; // already a weekday like "sunday"
}

async function getUserMeals(userId) {
    const params = {
        TableName: TABLE_NAME,
        Key: { userId }
    };

    try {
        const result = await dynamoDB.get(params).promise();
        const mealsObj = result.Item?.meals || {};

        const flatList = Object.entries(mealsObj).map(([key, value]) => {
            const [day, mealType] = key.split('_');
            return { day, mealType, mealName: value.S || value }; // handle raw or DynamoDB-typed
        });

        const structured = flatList.reduce((acc, { day, mealType, mealName }) => {
            if (!acc[mealType]) acc[mealType] = {};
            acc[mealType][day] = mealName;
            return acc;
        }, {});

        return { flatList, structured };

    } catch (error) {
        console.error('Error fetching meals:', error);
        return { flatList: [], structured: {} }; // Ensure fallback shape
    }
}

  
const YesIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
             Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
    },
    handle(handlerInput) {
      const speakOutput = 'Great! Which meal would you like to add next?';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt('Please tell me the meal you want to add. You can say things like edit Monday breakfast to pancakes')
        .getResponse();
    }
  };
  
  const NoIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
             Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent';
    },
    handle(handlerInput) {
      const speakOutput = 'Okay, your meals are all set. Goodbye!';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .withShouldEndSession(true)
        .getResponse();
    }
  };
  

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
        GetAllMealsIntentHandler,
        SaveMealsFromAPLIntentHandler,
        YesIntentHandler,
        NoIntentHandler,
        FreeSpeechIntentHandler,
        CanFulfillIntentRequestHandler
    )
    .addRequestInterceptors(LoggingRequestInterceptor)
    .addResponseInterceptors(LoggingResponseInterceptor)
    .addErrorHandlers(ErrorHandler)
    .lambda();
