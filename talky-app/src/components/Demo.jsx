import React from 'react';
import Section from './Section';
import Heading from './Heading';
import Button from './Button';
import { stars } from "../assets";

const Demo = () => {
  return (
    <Section id="demo">
      <div className="container relative z-2">
        <div className="hidden relative justify-center mb-[3rem] lg:flex">
          <div className="absolute left-1/2 w-[60rem] -translate-x-1/2 pointer-events-none" style={{ marginTop: '2px' }}>
            <img
              src={stars}
              className="w-full"
              width={950}
              height={400}
              alt="Stars"
            />
          </div>
        </div>

        <Heading 
          className=""
          title="Are You Still Not Convinced?"
        />

        <div className="relative z-1 max-w-[62rem] mx-auto text-center mb-[3.875rem] md:mb-20 lg:mb-[6.25rem] flex items-center justify-center">
          <a href="https://talkyrocket.streamlit.app/" target="_blank" rel="noreferrer">
            <Button className="lg:flex px-12 py-6 text-2xl">
              Click Here to Try Our Demo
            </Button>
          </a>
        </div>
        
      </div>
    </Section>
  )
}

export default Demo