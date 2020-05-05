import React from "react"
import { graphql } from "gatsby"
import { Paper, Grid, Box } from "@material-ui/core"
import Layout from "../components/layout"
import ContactForm from "../components/contact-form"
import SEO from "../components/seo"
import { useIntl } from "gatsby-plugin-intl"
import { takeFirst, getGraphQlNode, filterForNeedle } from "../util"

function getMarkdownHead(node) {
    return node?.frontmatter
}

const FaqPage = ({ data }) => {
    const { locale } = useIntl()
    const filterMarkdownsForLang = filterForNeedle(locale, "lang")
    const { allMarkdownRemark } = data

    const { frontmatter, html } = getGraphQlNode(
        takeFirst(
            allMarkdownRemark?.edges?.filter(edge => filterMarkdownsForLang(getMarkdownHead(getGraphQlNode(edge))))
        )
    )

    const { title = "" } = frontmatter

    return (
        <Layout>
            <SEO title={title} />
            <section className="faq">
                <Grid container xs={12} justify="center">
                    <Grid item xs={10}>
                        <Paper elevation={2}>
                            <Box p={2}>
                                <h1>{title}</h1>
                                <div className="faq-content" dangerouslySetInnerHTML={{ __html: html }} />
                                <ContactForm />
                            </Box>
                        </Paper>
                    </Grid>
                </Grid>
            </section>
        </Layout>
    )
}

export default FaqPage

export const query = graphql`
    query {
        allMarkdownRemark {
            edges {
                node {
                    html
                    frontmatter {
                        lang
                        path
                        title
                    }
                }
            }
        }
    }
`
