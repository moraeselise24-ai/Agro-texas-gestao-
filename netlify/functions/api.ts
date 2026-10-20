import serverless from 'serverless-http'
import app from '../../api/app.js'

export const handler = serverless(app)
