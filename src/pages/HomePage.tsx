import { useEffect, useState } from "react";
import { coupleNames } from "../../shared/wedding";
import { enableReveal } from "../components/Reveal";
import { Countdown } from "./home/Countdown";
import { Hero } from "./home/Hero";
import { Contact, Details, Footer, Gallery, GuestGuide, RsvpCallout, Schedule, Story } from "./home/Sections";

export default function HomePage() {
  const [now] = useState(() => Date.now());

  useEffect(() => {
    document.title = `${coupleNames()} · Wedding Invitation`;
    enableReveal();
  }, []);

  return (
    <>
      <Hero />
      <main>
        <Countdown />
        <Details />
        <Schedule />
        <GuestGuide />
        <Story />
        <Gallery />
        <RsvpCallout now={now} />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
