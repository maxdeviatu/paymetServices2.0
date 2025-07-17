const fs = require('fs-extra')
const path = require('path')
const Handlebars = require('handlebars')

function renderTemplate (templateName, variables) {
  try {
    const templatePath = path.join(__dirname, 'templates', `${templateName}.hbs`)

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`)
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8')
    const template = Handlebars.compile(templateContent)
    return template(variables)
  } catch (error) {
    console.error(`Error rendering template ${templateName}:`, error)
    throw error
  }
}

module.exports = { renderTemplate }
