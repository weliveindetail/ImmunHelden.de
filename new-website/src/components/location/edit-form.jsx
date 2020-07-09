import React, { useState } from "react"
import { Location } from '@reach/router'
import { makeStyles } from '@material-ui/core/styles';
import { TextField, Button } from '@material-ui/core';
import firebase from "gatsby-plugin-firebase"
import { navigate, useIntl } from "gatsby-plugin-intl"
import { useForm } from "react-hook-form"
import SaveIcon from '@material-ui/icons/Save';
import { LOCATION_COLLECTION } from "."

const useStyles = makeStyles((theme) => ({
  root: {
    '& > *': {
      margin: theme.spacing(1),
    },
  },
}));

export const EditForm = ({ docId, doc, onError }) => {
  const classes = useStyles()
  const { formatMessage } = useIntl()

  // The defaultValues setting here would be great. Not sure why it doesn't work.
  const { register, handleSubmit } = useForm({ defaultValues: doc })

  async function onSubmit(data) {
    // Debugging
    console.log(data) // <-- Always getting {} here
    return

    try {

      // Throws explicitly if the title is empty.
      if (!data.title || data.title.length === 0)
        throw new Error("requiredFieldMissing/title")


      // Blocks until the update operation is complete and throws if it failed.
      await firebase.firestore().collection(LOCATION_COLLECTION).doc(docId).update({
        title: data.title,
        address: data.address,
        phone: data.phone,
        email: data.email,
        contact: data.contact,
      })

      navigate("/partner/", {
        replace: true,
        state: { result: "saved" },
      })
    } catch (err) {
      // Block submit and prevent navigation, so the user can fix the issue.
      onError(err)
    }
  }

  return (
    <form className={classes.root} onSubmit={handleSubmit(onSubmit)}>
      <TextField disabled fullWidth label={formatMessage({ id: "partnerLocation_Anchor" })} value={"#" + docId} />
      <TextField disabled fullWidth label={formatMessage({ id: "partnerLocation_PartnerID" })} value={doc.partnerId} />
      <TextField name="title" id="title" fullWidth label={formatMessage({ id: "partnerLocation_Title" })} defaultValue={doc.title} ref={() => register({ required: true })} />
      <TextField name="address" id="address" fullWidth label={formatMessage({ id: "partnerLocation_Address" })} ref={register} />
      <TextField name="phone" id="phone" fullWidth label={formatMessage({ id: "partnerLocation_Phone" })} ref={register} />
      <TextField name="email" id="email" fullWidth label={formatMessage({ id: "partnerLocation_Email" })} ref={register} />
      <TextField name="contact" id="contact" fullWidth label={formatMessage({ id: "partnerLocation_Contact" })} ref={register} />
      <Button type="submit" variant="contained" color="primary" size="large" startIcon={<SaveIcon />}>
        Save
      </Button>
      <Button variant="outlined" color="primary" size="large" onClick={() => navigate("/partner/")}>
        Back
      </Button>
    </form>
  )
}

export default EditForm
