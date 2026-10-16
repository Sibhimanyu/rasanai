import Foundation
import XCTest
@testable import StudioCore

final class CrewRolesTests: XCTestCase {
    func testRealDescriptionsFromCrewMjs() {
        let cases: [(String, String)] = [
            ("Researching Tally: features, releases, real numbers", "tara"),
            ("Finding Tally's real logo, colours, type and motion", "tara"),
            ("Collecting real screens of ChatGPT for Mac", "tara"),
            ("Studying Notion's past launch films shot by shot", "tara"),
            ("Reading the local project ~/code/tally you approved", "tara"),
            ("Merging the research into one truth sheet", "tara"),
            ("Researching Tally's visual world and the library references that fit", "tara"),
            ("Writing the Sure script", "kavi"),
            ("Writing the Bold treatment for the song", "kavi"),
            ("Editing the three scripts like a hostile reader", "kavi"),
            ("Reading the thumbnail sheet and the intent, and cutting what buys nothing", "kavi"),
            ("Scoring the chosen script and look against the literal brief, before any expensive work", "kavi"),
            ("Designing the Sure design system for this story", "chitra"),
            ("Making the film's pictures: one consistent world of illustrations, icons, cut-outs, line art and handwriting", "chitra"),
            ("Drawing the Sure look's three hero styleframes on this story", "chitra"),
            ("Judging every styleframe next to reference stills of the same kind", "chitra"),
            ("Judging two films blind (X or Y) and picking the one to show", "chitra"),
            ("Reading Tally's own guidelines, fonts and logos into a design system", "chitra"),
            ("Reading Tally's own films and writing down its film style", "chitra"),
            ("Inventing the hero moves for the Sure script", "laya"),
            ("Judging every move idea blind and ranking the best", "laya"),
            ("Scoring how the whole film moves", "laya"),
            ("Checking every cut and building the signature transition", "laya"),
            ("Animating scene 3", "laya"),
            ("Building the whole film in one pass, root and every beat", "laya"),
            ("Reviewing the film with fresh eyes", "rasika"),
            ("Reading how the film was made and keeping at most two craft rules for the next one", "rasika"),
            ("Logging bin 2: every shot described, rated and trimmed", "mala"),
            ("Finding the bites, the moments and the story in the footage", "mala"),
            ("Writing the Sure paper edit from the footage", "mala"),
        ]
        for (description, key) in cases {
            XCTAssertEqual(CrewRoles.character(forDescription: description), key, description)
        }
        XCTAssertNil(CrewRoles.character(forDescription: "A helper"))
    }

    func testEveryRoleHasOneOfTheSevenCharacters() {
        XCTAssertEqual(CrewRoles.roleCharacters.count, 32)
        for (role, key) in CrewRoles.roleCharacters { XCTAssertTrue(CrewRoles.keys.contains(key), role) }
        XCTAssertEqual(CrewRoles.character(forRole: "film-builder"), "laya")
        XCTAssertEqual(CrewRoles.character(forRole: "general-purpose"), nil)
        XCTAssertNil(CrewRoles.character(forRole: nil))
    }

    func testRoleFromPromptPaths() {
        XCTAssertEqual(CrewRoles.role(fromPrompt: "Read crew/prompts/script-writer-sure.md and write the script."), "script-writer")
        XCTAssertEqual(CrewRoles.role(fromPrompt: "crew/prompts/critic.md"), "critic")
        XCTAssertEqual(CrewRoles.role(fromPrompt: "Read /tmp/film/crew/prompts/critic-final.md first"), "critic")
        XCTAssertEqual(CrewRoles.role(fromPrompt: "Read crew/prompts/scene-animator-3.md"), "scene-animator")
        XCTAssertEqual(CrewRoles.role(fromPrompt: "Read crew/prompts/styleframe-designer-heroes-sure.md"), "styleframe-designer")
        XCTAssertEqual(CrewRoles.role(fromPrompt: "crew/prompts/design-system-designer-bold.md."), "design-system-designer")
        XCTAssertNil(CrewRoles.role(fromPrompt: "Write a script about the product."))
        XCTAssertNil(CrewRoles.role(fromPrompt: "Read crew/prompts/unknown-role.md"))
        // a later path wins when the first names nothing known
        XCTAssertEqual(CrewRoles.role(fromPrompt: "crew/prompts/nope.md then crew/prompts/footage-logger-2.md"), "footage-logger")
    }

    func testEngineStoresPromptRoleAndFallsBackToSubagentType() {
        var engine = FilmProgressEngine()
        engine.ingestToolUse(id: "a", name: "Agent", input: ["description": "Writing the Sure script", "subagent_type": "general-purpose",
                                                             "prompt": "Read crew/prompts/script-writer-sure.md and follow it."], parent: nil, Date())
        engine.ingestToolUse(id: "b", name: "Agent", input: ["description": "Animating scene 3", "subagent_type": "general-purpose",
                                                             "prompt": "Do the thing."], parent: nil, Date())
        XCTAssertEqual(engine.crew["a"]?.role, "script-writer")
        XCTAssertEqual(engine.crew["b"]?.role, "general-purpose")
    }

    func testRoutesPanelsAndPhases() {
        XCTAssertEqual(CrewRoles.character(forRoute: .working), "ra")
        XCTAssertEqual(CrewRoles.character(forRoute: .brief), "tara")
        XCTAssertEqual(CrewRoles.character(forRoute: .story), "kavi")
        XCTAssertEqual(CrewRoles.character(forRoute: .look), "chitra")
        XCTAssertEqual(CrewRoles.character(forRoute: .animatic), "laya")
        XCTAssertEqual(CrewRoles.character(forRoute: .build), "laya")
        XCTAssertEqual(CrewRoles.character(forRoute: .final), "rasika")
        XCTAssertEqual(CrewRoles.character(forRoute: .panel("footage")), "mala")
        XCTAssertEqual(CrewRoles.character(forRoute: .panel("music")), "laya")
        XCTAssertEqual(CrewRoles.character(forPanel: "storyboard"), "chitra")
        XCTAssertEqual(CrewRoles.character(forPanel: "decisions"), "ra")
        let phases: [ProgressPhase: String] = [.research: "tara", .script: "kavi", .look: "chitra", .plan: "kavi",
                                               .animatic: "laya", .build: "laya", .check: "rasika", .render: "rasika"]
        for phase in ProgressPhase.allCases { XCTAssertEqual(CrewRoles.character(forPhase: phase), phases[phase], phase.rawValue) }
    }
}
