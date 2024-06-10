const { Client } = require('pg');
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    let client;

    try {
        const params = {
            Name: '/Life/LocalDatabase',
            WithDecryption: true
        };
        const data = await ssm.getParameter(params).promise();
        const dbConfig = JSON.parse(data.Parameter.Value);

        client = new Client({
            host: dbConfig.DB_HOST,
            database: dbConfig.DB_NAME,
            user: dbConfig.DB_USER,
            password: dbConfig.DB_PASSWORD,
            port: dbConfig.DB_PORT
        });

        await client.connect();

        const userId = event.userId;
        const templateId = event.templateId;

        if (!userId || !templateId) {
            throw new Error('Missing required parameters: userId and templateId.');
        }

        // Insert a new workout record and get the workout ID
        const res = await client.query(
            'INSERT INTO fitness.completed_workouts (workout_template_id, user_id) VALUES ($1, $2) RETURNING completed_workout_id',
            [templateId, userId]
        );
        const workoutId = res.rows[0].completed_workout_id;
        console.log("workoutId: ", workoutId);

        // Fetch exercises along with their details
        const exercisesRes = await client.query(`
            SELECT we.exercise_id, we.order, we.min_reps, we.max_reps, we.goal_weight, we.rest_time, we.set_type_id,
                   e.name, e.description
            FROM fitness.workout_exercises we
            JOIN fitness.exercises e ON we.exercise_id = e.exercise_id
            WHERE we.workout_template_id = $1
            ORDER BY we.order
        `, [templateId]);

        const exercises = exercisesRes.rows;

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*', // Allow all origins for CORS
                'Access-Control-Allow-Credentials': true, // Include credentials for CORS
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                workoutId: workoutId.toString(),
                exercises: exercises // Return exercises with details
            }),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*', // Allow all origins for CORS
                'Access-Control-Allow-Credentials': true, // Include credentials for CORS
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'Internal Server Error', message: err.message }),
        };
    } finally {
        if (client) {
            await client.end();
        }
    }
};